using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace BabylonQuarks.UnityExporter
{
    /// <summary>
    /// Full parity audit: comprehensive Unity probe vs <em>expected</em> conversion vs the
    /// <em>actual</em> exported JSON envelope. Produces field-level rows so we can find where
    /// conversion diverges on effects that score "full" but look wrong (e.g. FlamethrowerToonyBlue).
    /// </summary>
    public static class EffectParityAudit
    {
        private const double FloatEps = 1e-4;

        public sealed class Row
        {
            public string Field;
            public string Status;
            public JToken Unity;
            public JToken Expected;
            public JToken Exported;
            public string Note;
        }

        [MenuItem("Tools/Quarks/Audit Effect Parity (Selected)", false, 22)]
        public static void AuditSelectedMenu()
        {
            GameObject root = Selection.activeGameObject;
            if (root == null || root.GetComponentsInChildren<ParticleSystem>(true).Length == 0)
            {
                EditorUtility.DisplayDialog("Quarks Parity Audit",
                    "Select a GameObject with ParticleSystem(s) in the Hierarchy.", "OK");
                return;
            }

            string path = EditorUtility.SaveFilePanel(
                "Save effect parity audit",
                "",
                root.name + ".parity.json",
                "json");
            if (string.IsNullOrEmpty(path)) return;

            JObject report = Audit(root);
            WriteReport(path, report);

            EditorUtility.RevealInFinder(path);

            var summary = report.GetObject("summary");
            int diff = summary != null ? ReadInt(summary, "differences") : 0;
            EditorUtility.DisplayDialog(
                "Quarks Parity Audit",
                diff == 0
                    ? $"Wrote parity audit for '{root.name}' — no field differences flagged."
                    : $"Wrote parity audit for '{root.name}' — {diff} field difference(s). See notableDifferences in JSON.",
                "OK");
        }

        [MenuItem("Tools/Quarks/Audit Effect Parity (Selected)", true)]
        private static bool ValidateAuditSelectedMenu() =>
            Selection.activeGameObject != null
            && Selection.activeGameObject.GetComponentsInChildren<ParticleSystem>(true).Length > 0;

        private static void WriteReport(string path, JObject report) =>
            File.WriteAllText(path, report.ToString());

        /// <summary>Builds a full parity report for one effect hierarchy.</summary>
        public static JObject Audit(GameObject root)
        {
            Transform rootTransform = root.transform;
            JObject envelope = QuarksExporter.ExportEnvelope(root);
            JObject rootNode = envelope.GetObject("object");
            var exportedByPath = new Dictionary<string, ExportedEmitter>();
            IndexExportedEmitters(rootNode, "", exportedByPath);

            var expectedByPath = new Dictionary<string, JObject>();
            foreach (var ps in root.GetComponentsInChildren<ParticleSystem>(true))
            {
                var renderer = ps.GetComponent<ParticleSystemRenderer>();
                string path = UnityEffectProbe.HierarchyPath(ps.transform, rootTransform);
                expectedByPath[path] = ParticleConverter.BuildPs(ps, renderer, new ExportContext());
            }

            var assessment = ExportCoverage.Assess(root);
            var systems = new JArray();
            var allRows = new List<Row>();
            int match = 0, transformed = 0, mismatch = 0, exportOnly = 0, unityOnly = 0;

            foreach (var ps in root.GetComponentsInChildren<ParticleSystem>(true))
            {
                var renderer = ps.GetComponent<ParticleSystemRenderer>();
                string path = UnityEffectProbe.HierarchyPath(ps.transform, rootTransform);
                JObject unity = UnityEffectProbe.Probe(ps, renderer, rootTransform);

                exportedByPath.TryGetValue(path, out ExportedEmitter exported);
                expectedByPath.TryGetValue(path, out JObject expectedPs);
                JObject exportedPs = exported?.Ps;
                JObject exportedNode = exported?.Node;

                var rows = new List<Row>();
                CompareSystem(ps, unity, expectedPs, exportedPs, exportedNode, envelope, rows);
                allRows.AddRange(rows);

                var rowArr = RowsToJson(rows, ref match, ref transformed, ref mismatch, ref exportOnly, ref unityOnly);

                systems.Add(new JObject()
                    .Set("path", path)
                    .Set("name", ps.name)
                    .Set("unity", unity)
                    .Set("expectedPs", expectedPs ?? new JObject().Set("missing", true))
                    .Set("exported", new JObject()
                        .Set("node", exportedNode ?? new JObject().Set("missing", true))
                        .Set("ps", exportedPs ?? new JObject().Set("missing", true))
                        .Set("material", ResolveMaterial(exportedPs, envelope)))
                    .Set("parity", rowArr));
            }

            var notable = new JArray();
            foreach (var r in allRows)
            {
                if (r.Status == "match") continue;
                notable.Add(RowToJson(r));
            }

            return new JObject()
                .Set("metadata", new JObject()
                    .Set("generator", "unity-quark-exporter-parity-audit")
                    .Set("version", 2)
                    .Set("generatedAt", DateTime.UtcNow.ToString("o"))
                    .Set("effectName", root.name)
                    .Set("howToRead", new JArray()
                        .Add("unity — raw Shuriken values from UnityEffectProbe")
                        .Add("expected — what ParticleConverter should emit (re-built independently)")
                        .Add("exported — what ExportEnvelope actually wrote")
                        .Add("status match/transformed/mismatch — compare expected vs exported; unity column is context")))
                .Set("coverage", new JObject()
                    .Set("tier", ExportCoverage.TierName(assessment.Tier))
                    .Set("score", Math.Round(assessment.Score, 4))
                    .Set("issues", IssuesArray(assessment)))
                .Set("summary", new JObject()
                    .Set("systemCount", systems.Items.Count)
                    .Set("fieldRows", allRows.Count)
                    .Set("match", match)
                    .Set("transformed", transformed)
                    .Set("mismatch", mismatch)
                    .Set("export_only", exportOnly)
                    .Set("unity_only", unityOnly)
                    .Set("differences", mismatch + exportOnly + unityOnly))
                .Set("notableDifferences", notable)
                .Set("systems", systems)
                .Set("exportEnvelope", envelope);
        }

        private static JArray RowsToJson(
            List<Row> rows,
            ref int match,
            ref int transformed,
            ref int mismatch,
            ref int exportOnly,
            ref int unityOnly)
        {
            var rowArr = new JArray();
            foreach (var r in rows)
            {
                rowArr.Add(RowToJson(r));
                switch (r.Status)
                {
                    case "match": match++; break;
                    case "transformed": transformed++; break;
                    case "mismatch": mismatch++; break;
                    case "export_only": exportOnly++; break;
                    case "unity_only": unityOnly++; break;
                }
            }
            return rowArr;
        }

        private static JObject RowToJson(Row r) =>
            new JObject()
                .Set("field", r.Field)
                .Set("status", r.Status)
                .Set("unity", r.Unity ?? JNull.Instance)
                .Set("expected", r.Expected ?? JNull.Instance)
                .Set("exported", r.Exported ?? JNull.Instance)
                .Set("note", r.Note);

        private static void CompareSystem(
            ParticleSystem ps,
            JObject unity,
            JObject expectedPs,
            JObject exportedPs,
            JObject exportedNode,
            JObject envelope,
            List<Row> rows)
        {
            string prefix = ps.name + ".";

            if (exportedPs == null)
            {
                rows.Add(MakeRow(prefix + "ps", "mismatch", unity, expectedPs, null,
                    "ParticleEmitter missing in export tree for this hierarchy path."));
                return;
            }

            if (expectedPs == null)
            {
                rows.Add(MakeRow(prefix + "ps", "mismatch", unity, null, exportedPs,
                    "Could not re-build expected ps for this path."));
                return;
            }

            // ---- ps scalars ---------------------------------------------------------
            CmpScalar(rows, prefix + "duration", unity.GetObject("main"), "duration", expectedPs, exportedPs, "duration");
            CmpScalar(rows, prefix + "looping", unity.GetObject("main"), "looping", expectedPs, exportedPs, "looping");
            CmpScalar(rows, prefix + "prewarm", unity.GetObject("main"), "prewarm", expectedPs, exportedPs, "prewarm");
            CmpBoolWorld(rows, prefix + "worldSpace", unity.GetObject("main"), expectedPs, exportedPs);
            CmpCurve(rows, prefix + "startDelay", unity.GetObject("main"), "startDelay", expectedPs, exportedPs, "startDelay");
            CmpCurve(rows, prefix + "startLife", unity.GetObject("main"), "startLifetime", expectedPs, exportedPs, "startLife",
                "May include knife-edge lifetime nudge when rate×life is integer.");
            CmpCurve(rows, prefix + "startSpeed", unity.GetObject("main"), "startSpeed", expectedPs, exportedPs, "startSpeed");
            CmpCurve(rows, prefix + "startSize", unity.GetObject("main"), "startSize", expectedPs, exportedPs, "startSize",
                "3D start size → Vector3Function in export.");
            CmpToken(rows, prefix + "startColor", unity.GetObject("main")?.Get("startColor"),
                expectedPs.Get("startColor"), exportedPs.Get("startColor"), null);
            CmpCurve(rows, prefix + "emissionOverTime", unity.GetObject("emission"), "rateOverTime", expectedPs, exportedPs, "emissionOverTime");
            CmpCurve(rows, prefix + "emissionOverDistance", unity.GetObject("emission"), "rateOverDistance", expectedPs, exportedPs, "emissionOverDistance");

            // shape
            CmpShape(rows, prefix, unity.GetObject("shape"), expectedPs.GetObject("shape"), exportedPs.GetObject("shape"));

            // renderer / material
            CmpScalar(rows, prefix + "renderMode", null, null, expectedPs, exportedPs, "renderMode",
                "Unity ParticleSystemRenderMode → quarks renderMode int");
            CmpScalar(rows, prefix + "blending", unity.GetObject("material")?.Get("inferredBlend"),
                null, expectedPs, exportedPs, "blending", "Material → quarks blending int");
            CmpStretchRenderer(rows, prefix, unity.GetObject("renderer"), expectedPs, exportedPs);

            // TSA tiles
            var tsa = unity.GetObject("textureSheetAnimation");
            if (ReadBool(tsa, "enabled"))
            {
                CmpScalar(rows, prefix + "uTileCount", tsa, "numTilesX", expectedPs, exportedPs, "uTileCount");
                CmpScalar(rows, prefix + "vTileCount", tsa, "numTilesY", expectedPs, exportedPs, "vTileCount");
                CmpCurve(rows, prefix + "startTileIndex", tsa, "startFrame", expectedPs, exportedPs, "startTileIndex");
                CmpTsaFrameOverLife(rows, prefix, ps, expectedPs, exportedPs);
            }

            // behaviors
            JArray expectedBehaviors = expectedPs.GetArray("behaviors");
            JArray exportedBehaviors = exportedPs.GetArray("behaviors");
            CmpBehaviorGradient(rows, prefix, "ColorOverLife", "colorOverLifetime", unity, expectedBehaviors, exportedBehaviors);
            CmpBehaviorSize(rows, prefix, "SizeOverLife", "sizeOverLifetime", unity, expectedBehaviors, exportedBehaviors);
            CmpBehaviorCurve(rows, prefix, "RotationOverLife", "rotationOverLifetime", unity, expectedBehaviors, exportedBehaviors, "angularVelocity");
            CmpGravity(rows, prefix, unity.GetObject("main"), expectedBehaviors, exportedBehaviors);
            CmpNoise(rows, prefix, unity.GetObject("noise"), expectedBehaviors, exportedBehaviors);
            CmpVelocity(rows, prefix, unity.GetObject("velocityOverLifetime"), expectedBehaviors, exportedBehaviors);
            CmpSubEmitters(rows, prefix, unity.GetObject("subEmitters"), expectedBehaviors, exportedBehaviors);

            // transform matrix present
            if (exportedNode != null && exportedNode.Get("matrix") != null)
            {
                AddRow(rows, prefix + "node.matrix", "transformed",
                    unity.GetObject("transform"), expectedPs.Get("node"), exportedNode.Get("matrix"),
                    "Unity local TRS exported as column-major 16-float matrix on node.");
            }

            // Sanity: expected vs exported should match for fields we compare (material uuid excluded).
            if (!StructuralEquals(expectedPs.Get("startLife"), exportedPs.Get("startLife")))
            {
                // already captured in CmpCurve row
            }
        }

        // ---- comparators ----------------------------------------------------------

        private static void CmpScalar(
            List<Row> rows,
            string field,
            JObject unity,
            string uKey,
            JObject expected,
            JObject exported,
            string eKey,
            string note = null)
        {
            JToken u = unity != null && uKey != null ? unity.Get(uKey) : null;
            JToken exp = expected?.Get(eKey);
            JToken act = exported?.Get(eKey);
            if (exp == null && act == null) return;
            AddCompareRow(rows, field, u, exp, act, note);
        }

        private static void CmpBoolWorld(List<Row> rows, string field, JObject main, JObject expected, JObject exported)
        {
            if (main == null) return;
            string space = ReadString(main, "simulationSpace");
            bool world = space == "World";
            bool expWorld = ReadBool(expected, "worldSpace");
            bool actWorld = ReadBool(exported, "worldSpace");
            string status = StatusOf(expWorld, actWorld, "simulationSpace World → ps.worldSpace");
            AddRow(rows, field, status, world, expWorld, actWorld, "simulationSpace World → ps.worldSpace");
        }

        private static void CmpCurve(
            List<Row> rows,
            string field,
            JObject unityParent,
            string uKey,
            JObject expected,
            JObject exported,
            string eKey,
            string note = null)
        {
            if (unityParent == null || !unityParent.Members.Exists(m => m.Key == uKey)) return;
            JObject uCurve = unityParent.GetObject(uKey);
            if (uCurve == null) return;
            string mode = ReadString(uCurve, "mode");
            if (mode == "Disabled" || string.IsNullOrEmpty(mode)) return;

            JToken exp = expected?.Get(eKey);
            JToken act = exported?.Get(eKey);
            string curveNote = note;
            if (mode == "TwoCurves")
                curveNote = CombineNote(curveNote, "Unity TwoCurves → RandomBetweenCurves");
            AddCompareRow(rows, field, uCurve, exp, act, curveNote);
        }

        private static void CmpToken(List<Row> rows, string field, JToken unity, JToken expected, JToken exported, string note) =>
            AddCompareRow(rows, field, unity, expected, exported, note);

        private static void CmpShape(List<Row> rows, string prefix, JObject unityShape, JObject expectedShape, JObject exportShape)
        {
            if (unityShape == null || !ReadBool(unityShape, "enabled"))
            {
                string eType = exportShape != null ? ReadString(exportShape, "type") : null;
                if (eType == "point")
                {
                    AddRow(rows, prefix + "shape", "transformed", "disabled", expectedShape, exportShape,
                        "Disabled shape → point");
                }
                return;
            }

            string uType = ReadString(unityShape, "shapeType");
            string eTypeExp = expectedShape != null ? ReadString(expectedShape, "type") : null;
            string eTypeAct = exportShape != null ? ReadString(exportShape, "type") : null;
            AddCompareRow(rows, prefix + "shape.type", uType, eTypeExp, eTypeAct, ShapeNote(uType, eTypeAct));

            if (eTypeAct == "cone" || uType.Contains("Cone"))
            {
                float uAngle = ReadFloat(unityShape, "angle");
                float eAngle = ReadFloat(exportShape, "angle");
                AddRow(rows, prefix + "shape.angle",
                    Mathf.Abs(uAngle * Mathf.Deg2Rad - eAngle) < 1e-3f ? "transformed" : "mismatch",
                    uAngle, ReadFloat(expectedShape, "angle"), eAngle, "degrees → radians");
            }

            if (eTypeAct == "rectangle" || uType.StartsWith("Box"))
            {
                var scale = unityShape.GetArray("scale");
                float uW = scale != null && scale.Items.Count > 0 ? ReadNumber(scale.Items[0]) : 0;
                float uH = scale != null && scale.Items.Count > 1 ? ReadNumber(scale.Items[1]) : 0;
                AddCompareRow(rows, prefix + "shape.boxScale",
                    new JObject().Set("x", uW).Set("y", uH),
                    new JObject().Set("width", ReadFloat(expectedShape, "width")).Set("height", ReadFloat(expectedShape, "height")),
                    new JObject().Set("width", ReadFloat(exportShape, "width")).Set("height", ReadFloat(exportShape, "height")),
                    "Box scale → rectangle width/height; Z dropped");
            }
        }

        private static void CmpStretchRenderer(List<Row> rows, string prefix, JObject renderer, JObject expected, JObject exported)
        {
            if (renderer == null || ReadString(renderer, "renderMode") != "Stretch") return;
            JObject expSettings = expected?.GetObject("rendererEmitterSettings");
            JObject actSettings = exported?.GetObject("rendererEmitterSettings");
            CmpScalar(rows, prefix + "renderer.velocityScale", renderer, "velocityScale", expSettings, actSettings, "speedFactor",
                "Stretch billboard: velocityScale → speedFactor");
            CmpScalar(rows, prefix + "renderer.lengthScale", renderer, "lengthScale", expSettings, actSettings, "lengthFactor",
                "Stretch billboard: lengthScale → lengthFactor");
        }

        private static void CmpTsaFrameOverLife(List<Row> rows, string prefix, ParticleSystem ps, JObject expected, JObject exported)
        {
            var tsa = ps.textureSheetAnimation;
            int tiles = Mathf.Max(1, tsa.numTilesX * tsa.numTilesY);
            JToken expFrame = FindBehavior(expected.GetArray("behaviors"), "FrameOverLife")?.Get("frame");
            JToken actFrame = FindBehavior(exported.GetArray("behaviors"), "FrameOverLife")?.Get("frame");
            JObject uCurve = UnityEffectProbe.ProbeCurve(tsa.frameOverTime);
            AddCompareRow(rows, prefix + "tsa.frameOverTime→FrameOverLife",
                uCurve, expFrame, actFrame,
                "frameOverTime (0..1) scaled to frame index 0..(tiles-1)");
            if (tsa.cycleCount > 1)
            {
                AddRow(rows, prefix + "tsa.cycleCount", "unity_only",
                    tsa.cycleCount, null, null, "cycleCount>1 not exported — single sweep only");
            }
        }

        private static void CmpBehaviorGradient(
            List<Row> rows,
            string prefix,
            string bType,
            string uModule,
            JObject unity,
            JArray expectedBehaviors,
            JArray exportedBehaviors)
        {
            JObject mod = unity.GetObject(uModule);
            if (!ReadBool(mod, "enabled")) return;
            JObject exp = FindBehavior(expectedBehaviors, bType);
            JObject act = FindBehavior(exportedBehaviors, bType);
            if (act == null)
            {
                AddRow(rows, prefix + bType, "mismatch", mod.GetObject("color"), exp?.Get("color"), null,
                    "enabled in Unity, missing in export behaviors");
                return;
            }
            JObject uColor = mod.GetObject("color");
            AddCompareRow(rows, prefix + bType + ".color", uColor, exp?.Get("color"), act.Get("color"),
                ReadString(uColor, "mode"));
        }

        private static void CmpBehaviorSize(
            List<Row> rows,
            string prefix,
            string bType,
            string uModule,
            JObject unity,
            JArray expectedBehaviors,
            JArray exportedBehaviors)
        {
            JObject mod = unity.GetObject(uModule);
            if (!ReadBool(mod, "enabled")) return;
            JObject exp = FindBehavior(expectedBehaviors, bType);
            JObject act = FindBehavior(exportedBehaviors, bType);
            if (act == null)
            {
                AddRow(rows, prefix + bType, "mismatch", mod, exp, null, "enabled in Unity, missing in export");
                return;
            }
            AddCompareRow(rows, prefix + bType + ".size", mod, exp?.Get("size"), act.Get("size"),
                ReadBool(mod, "separateAxes") ? "separateAxes → Vector3Function" : null);
        }

        private static void CmpBehaviorCurve(
            List<Row> rows,
            string prefix,
            string bType,
            string uModule,
            JObject unity,
            JArray expectedBehaviors,
            JArray exportedBehaviors,
            string bKey)
        {
            JObject mod = unity.GetObject(uModule);
            if (!ReadBool(mod, "enabled")) return;
            JObject exp = FindBehavior(expectedBehaviors, bType);
            JObject act = FindBehavior(exportedBehaviors, bType);
            if (act == null)
            {
                AddRow(rows, prefix + bType, "mismatch", mod, exp, null, "enabled in Unity, missing in export");
                return;
            }
            string note = ReadBool(mod, "separateAxes")
                ? "separateAxes rotation — only Z exported; deg/s → rad/s"
                : "deg/s → rad/s";
            AddCompareRow(rows, prefix + bType + "." + bKey, mod.GetObject("z"), exp?.Get(bKey), act.Get(bKey), note);
        }

        private static void CmpGravity(List<Row> rows, string prefix, JObject main, JArray expectedBehaviors, JArray exportedBehaviors)
        {
            JObject g = main?.GetObject("gravityModifier");
            if (g == null) return;
            float mod = ReadCurveConstant(g);
            if (Mathf.Abs(mod) < 1e-6f) return;
            JObject expForce = FindBehavior(expectedBehaviors, "ForceOverLife");
            JObject actForce = FindBehavior(exportedBehaviors, "ForceOverLife");
            if (actForce == null)
            {
                AddRow(rows, prefix + "gravity", "mismatch", g, expForce, null, "gravityModifier set but no ForceOverLife");
                return;
            }
            float expectedY = ReadCurveConstant(expForce.GetObject("y"));
            float actualY = ReadCurveConstant(actForce.GetObject("y"));
            AddCompareRow(rows, prefix + "gravity→ForceOverLife.y",
                g, expectedY, actualY, "world gravity via ForceOverLife");
        }

        private static void CmpNoise(List<Row> rows, string prefix, JObject noise, JArray expectedBehaviors, JArray exportedBehaviors)
        {
            if (!ReadBool(noise, "enabled")) return;
            JObject exp = FindBehavior(expectedBehaviors, "Noise");
            JObject act = FindBehavior(exportedBehaviors, "Noise");
            if (act == null)
            {
                AddRow(rows, prefix + "noise", "mismatch", noise, exp, null, "enabled in Unity, missing in export");
                return;
            }
            CmpScalar(rows, prefix + "noise.frequency", noise, "frequency", exp, act, "frequency");
            AddCompareRow(rows, prefix + "noise.strength", noise.GetObject("strength"), exp?.Get("power"), act?.Get("power"), "strength → power");
            AddCompareRow(rows, prefix + "noise.positionAmount", noise.GetObject("positionAmount"), exp?.Get("positionAmount"), act?.Get("positionAmount"), null);
            AddCompareRow(rows, prefix + "noise.rotationAmount", noise.GetObject("rotationAmount"), exp?.Get("rotationAmount"), act?.Get("rotationAmount"), null);
        }

        private static void CmpVelocity(List<Row> rows, string prefix, JObject vel, JArray expectedBehaviors, JArray exportedBehaviors)
        {
            if (!ReadBool(vel, "enabled")) return;
            JObject exp = FindBehavior(expectedBehaviors, "VelocityOverLife");
            JObject act = FindBehavior(exportedBehaviors, "VelocityOverLife");
            if (act == null)
            {
                AddRow(rows, prefix + "velocityOverLifetime", "mismatch", vel, exp, null, "enabled in Unity, missing in export");
                return;
            }
            AddCompareRow(rows, prefix + "velocityOverLifetime", vel, exp, act, "exported as VelocityOverLife behavior");
        }

        private static void CmpSubEmitters(List<Row> rows, string prefix, JObject sub, JArray expectedBehaviors, JArray exportedBehaviors)
        {
            if (!ReadBool(sub, "enabled")) return;
            int expCount = CountBehavior(expectedBehaviors, "EmitSubParticleSystem");
            int actCount = CountBehavior(exportedBehaviors, "EmitSubParticleSystem");
            int unityCount = sub.GetArray("emitters")?.Items.Count ?? 0;
            AddCompareRow(rows, prefix + "subEmitters.count", unityCount, expCount, actCount,
                "EmitSubParticleSystem behaviors in export");
        }

        // ---- export tree index ----------------------------------------------------

        private sealed class ExportedEmitter
        {
            public JObject Node;
            public JObject Ps;
        }

        private static void IndexExportedEmitters(JObject node, string prefix, Dictionary<string, ExportedEmitter> dict)
        {
            if (node == null) return;
            string name = ReadString(node, "name") ?? "";
            string path = string.IsNullOrEmpty(prefix) ? name : prefix + "/" + name;
            if (ReadString(node, "type") == "ParticleEmitter")
            {
                dict[path] = new ExportedEmitter
                {
                    Node = node,
                    Ps = node.GetObject("ps"),
                };
            }
            JArray children = node.GetArray("children");
            if (children == null) return;
            foreach (var child in children.Items)
            {
                if (child is JObject c) IndexExportedEmitters(c, path, dict);
            }
        }

        private static JObject ResolveMaterial(JObject ps, JObject envelope)
        {
            if (ps == null) return null;
            string uuid = ReadString(ps, "material");
            if (string.IsNullOrEmpty(uuid)) return null;
            JArray materials = envelope.GetArray("materials");
            if (materials == null) return null;
            foreach (var m in materials.Items)
            {
                if (m is JObject mat && ReadString(mat, "uuid") == uuid) return mat;
            }
            return new JObject().Set("uuid", uuid).Set("resolved", false);
        }

        // ---- helpers --------------------------------------------------------------

        private static JObject FindBehavior(JArray behaviors, string type)
        {
            if (behaviors == null) return null;
            foreach (var b in behaviors.Items)
            {
                if (b is JObject o && ReadString(o, "type") == type) return o;
            }
            return null;
        }

        private static int CountBehavior(JArray behaviors, string type)
        {
            int n = 0;
            if (behaviors == null) return 0;
            foreach (var b in behaviors.Items)
            {
                if (b is JObject o && ReadString(o, "type") == type) n++;
            }
            return n;
        }

        private static string ShapeNote(string uType, string eType)
        {
            if (uType == "Box" || uType == "BoxShell" || uType == "BoxEdge")
                return "Box → rectangle (Z flattened)";
            if (eType == "point" && uType != "Disabled") return "unsupported shape collapsed to point";
            return null;
        }

        private static void AddCompareRow(List<Row> rows, string field, object unity, JToken expected, JToken exported, string note)
        {
            string status = StatusOf(expected, exported, note);
            AddRow(rows, field, status, unity, expected, exported, note);
        }

        private static string StatusOf(JToken expected, JToken exported, string note)
        {
            if (StructuralEquals(expected, exported))
                return string.IsNullOrEmpty(note) ? "match" : "transformed";
            return "mismatch";
        }

        private static string CombineNote(string a, string b) =>
            string.IsNullOrEmpty(a) ? b : (string.IsNullOrEmpty(b) ? a : a + "; " + b);

        private static void AddRow(List<Row> rows, string field, string status, object unity, object expected, object exported, string note)
        {
            rows.Add(MakeRow(field, status, ToToken(unity), ToToken(expected), ToToken(exported), note));
        }

        private static Row MakeRow(string field, string status, JToken unity, JToken expected, JToken exported, string note) =>
            new Row
            {
                Field = field,
                Status = status,
                Unity = unity,
                Expected = expected,
                Exported = exported,
                Note = note,
            };

        private static JToken ToToken(object v)
        {
            if (v == null) return JNull.Instance;
            if (v is JToken t) return t;
            if (v is bool b) return b;
            if (v is int i) return i;
            if (v is float f) return f;
            if (v is double d) return d;
            if (v is string s) return s;
            return new JString(v.ToString());
        }

        private static bool StructuralEquals(JToken a, JToken b)
        {
            if (ReferenceEquals(a, b)) return true;
            if (a == null || b == null) return false;
            if (a is JNull && b is JNull) return true;
            if (a is JNull || b is JNull) return false;

            if (a is JNumber na && b is JNumber nb)
                return Math.Abs(na.Value - nb.Value) <= FloatEps;

            if (a is JBool ba && b is JBool bb)
                return ba.ToString() == bb.ToString();

            if (a is JString sa && b is JString sb)
                return sa.Value == sb.Value;

            if (a is JArray aa && b is JArray ab)
            {
                if (aa.Items.Count != ab.Items.Count) return false;
                for (int i = 0; i < aa.Items.Count; i++)
                {
                    if (!StructuralEquals(aa.Items[i], ab.Items[i])) return false;
                }
                return true;
            }

            if (a is JObject oa && b is JObject ob)
            {
                if (oa.Members.Count != ob.Members.Count) return false;
                foreach (var kv in oa.Members)
                {
                    JToken bv = ob.Get(kv.Key);
                    if (bv == null) return false;
                    if (!StructuralEquals(kv.Value, bv)) return false;
                }
                return true;
            }

            return string.Equals(a.ToString(), b.ToString(), StringComparison.Ordinal);
        }

        private static float ReadCurveConstant(JObject curve)
        {
            if (curve == null) return 0;
            if (ReadString(curve, "mode") == "Constant") return ReadFloat(curve, "constant");
            JToken type = curve.Get("type");
            if (type is JString ts && ts.Value == "ConstantValue")
                return ReadFloat(curve, "value");
            return 0;
        }

        private static JArray IssuesArray(ExportCoverage.EffectAssessment a)
        {
            var arr = new JArray();
            foreach (var i in a.Issues)
            {
                arr.Add(new JObject()
                    .Set("code", i.Code)
                    .Set("severity", ExportCoverage.SeverityName(i.Severity))
                    .Set("system", i.SystemName)
                    .Set("message", i.Message));
            }
            return arr;
        }

        private static string ReadString(JObject o, string key)
        {
            JToken t = o?.Get(key);
            if (t is JString s) return s.Value;
            if (t is JNull) return null;
            return t?.ToString();
        }

        private static int ReadInt(JObject o, string key)
        {
            JToken t = o?.Get(key);
            if (t is JNumber n) return (int)n.Value;
            if (t is JBool b) return b.ToString() == "true" ? 1 : 0;
            return 0;
        }

        private static float ReadFloat(JObject o, string key)
        {
            JToken t = o?.Get(key);
            if (t is JNumber n) return (float)n.Value;
            return 0;
        }

        private static float ReadNumber(JToken t) => t is JNumber n ? (float)n.Value : 0;

        private static bool ReadBool(JObject o, string key)
        {
            JToken t = o?.Get(key);
            if (t is JBool b) return b.ToString() == "true";
            if (t is JNumber n) return Math.Abs(n.Value) > FloatEps;
            return false;
        }
    }
}
