using System.IO;
using UnityEditor;
using UnityEngine;

namespace BabylonQuarks.UnityExporter
{
    /// <summary>
    /// Editor entry point: takes the selected GameObject hierarchy (a ParticleSystem or a parent of
    /// several) and writes a Quarks JSON effect that babylon.quarks' QuarksLoader can load. Groups
    /// map to Group nodes, ParticleSystems to ParticleEmitter nodes; sub-emitters are wired through
    /// EmitSubParticleSystem behaviors.
    /// </summary>
    public static class QuarksExporter
    {
        [MenuItem("Tools/Quarks/Export Selected Effect to JSON", false, 1)]
        public static void ExportSelected()
        {
            GameObject root = Selection.activeGameObject;
            if (root == null)
            {
                EditorUtility.DisplayDialog("Quarks Exporter",
                    "Select a GameObject with a ParticleSystem (or a parent of several) in the Hierarchy.", "OK");
                return;
            }
            if (root.GetComponentsInChildren<ParticleSystem>(true).Length == 0)
            {
                EditorUtility.DisplayDialog("Quarks Exporter",
                    "No ParticleSystem found under the selected GameObject.", "OK");
                return;
            }

            string path = EditorUtility.SaveFilePanel("Export Quarks effect", "", root.name + ".json", "json");
            if (string.IsNullOrEmpty(path)) return;

            string json = Export(root);
            File.WriteAllText(path, json);
            Debug.Log($"[Quarks Exporter] Exported '{root.name}' → {path}");
            EditorUtility.RevealInFinder(path);
        }

        [MenuItem("Tools/Quarks/Export Selected Effect to JSON", true)]
        private static bool ValidateExportSelected() => Selection.activeGameObject != null;

        /// <summary>Serializes a GameObject hierarchy into the Quarks JSON envelope string.</summary>
        public static string Export(GameObject root)
        {
            var ctx = new ExportContext();

            // Pass 1: assign a stable node uuid to every transform (emitters too), then flag which
            // systems are sub-emitter targets — so their nodes serialize with onlyUsedByOther=true
            // and their parents' EmitSubParticleSystem behaviors can reference them by uuid.
            AssignUuids(root.transform, ctx);
            foreach (var ps in root.GetComponentsInChildren<ParticleSystem>(true))
            {
                var sub = ps.subEmitters;
                if (!sub.enabled) continue;
                for (int i = 0; i < sub.subEmittersCount; i++)
                {
                    ctx.MarkSubTarget(sub.GetSubEmitterSystem(i));
                }
            }

            // Pass 2: serialize the hierarchy into the object tree.
            JObject obj = SerializeNode(root.transform, ctx);

            // Mesh-shape emitters emit a source Mesh node each; attach them under the root so
            // linkReferences can resolve every mesh_surface.mesh reference.
            if (ctx.MeshSourceNodes.Count > 0)
            {
                JArray children = obj.GetOrCreateArray("children");
                foreach (var meshNode in ctx.MeshSourceNodes)
                {
                    children.Add(meshNode);
                }
            }

            var envelope = new JObject()
                .Set("metadata", new JObject()
                    .Set("version", 4.5)
                    .Set("type", "Object3D")
                    .Set("generator", "unity-quark-exporter"))
                .Set("geometries", ctx.Geometries)
                .Set("materials", ctx.Materials)
                .Set("textures", ctx.Textures)
                .Set("images", ctx.Images)
                .Set("object", obj);
            return envelope.ToString();
        }

        private static void AssignUuids(Transform t, ExportContext ctx)
        {
            ctx.AssignNodeUuid(t);
            foreach (Transform child in t)
            {
                AssignUuids(child, ctx);
            }
        }

        private static JObject SerializeNode(Transform t, ExportContext ctx)
        {
            var node = new JObject()
                .Set("uuid", ctx.GetTransformUuid(t))
                .Set("name", t.name)
                .Set("layers", 1)
                .Set("matrix", LocalMatrix(t));

            var ps = t.GetComponent<ParticleSystem>();
            if (ps != null)
            {
                var renderer = t.GetComponent<ParticleSystemRenderer>();
                node.Set("type", "ParticleEmitter").Set("ps", ParticleConverter.BuildPs(ps, renderer, ctx));
            }
            else
            {
                node.Set("type", "Group");
            }

            var children = new JArray();
            foreach (Transform child in t)
            {
                children.Add(SerializeNode(child, ctx));
            }
            if (children.Items.Count > 0)
            {
                node.Set("children", children);
            }
            return node;
        }

        /// <summary>Local TRS as a three.js/Babylon column-major 16-float matrix.</summary>
        private static JArray LocalMatrix(Transform t)
        {
            Matrix4x4 m = Matrix4x4.TRS(t.localPosition, t.localRotation, t.localScale);
            var arr = new JArray();
            for (int col = 0; col < 4; col++)
            {
                for (int row = 0; row < 4; row++)
                {
                    arr.Add(m[row, col]);
                }
            }
            return arr;
        }
    }
}
