using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace BabylonQuarks.ParityCapture
{
    /// <summary>Project-wide ground truth: colour space, render pipeline, quality, post-processing assets.</summary>
    internal static class ParityEnvironment
    {
        public static JMap Capture(ParityLog log)
        {
            var env = new JMap()
                .Set("unityVersion", Application.unityVersion)
                .Set("platform", Application.platform.ToString())
                .Set("graphicsDeviceType", SystemInfo.graphicsDeviceType.ToString())
                .Set("graphicsDeviceName", SystemInfo.graphicsDeviceName)
                .Set("graphicsDeviceVersion", SystemInfo.graphicsDeviceVersion)
                .Set("supportsFloatRenderTexture", SystemInfo.SupportsRenderTextureFormat(RenderTextureFormat.ARGBHalf))
                .Set("batchMode", Application.isBatchMode)
                .Set("playerColorSpace", PlayerSettings.colorSpace.ToString())
                .Set("activeColorSpace", QualitySettings.activeColorSpace.ToString())
                .Set("qualityLevel", QualitySettings.GetQualityLevel())
                .Set("qualityNames", QualitySettings.names)
                .Set("fixedDeltaTime", Time.fixedDeltaTime);

            RenderPipelineAsset current = GraphicsSettings.currentRenderPipeline;
            env.Set("renderPipeline", current == null
                ? (object)"Built-in"
                : new JMap()
                    .Set("type", current.GetType().FullName)
                    .Set("asset", SerializedDump.Reference(current))
                    .Set("serialized", SerializedDump.Dump(current)));
            env.Set("graphicsSettingsDefaultPipeline", SerializedDump.Reference(GraphicsSettings.defaultRenderPipeline));
            env.Set("qualityPipeline", SerializedDump.Reference(QualitySettings.renderPipeline));

            // The pipeline's renderer assets (URP forward renderer etc.) hold the post-processing,
            // depth and opaque-texture switches that decide how particles are drawn.
            if (current != null)
            {
                var renderers = new List<object>();
                var so = new SerializedObject(current);
                SerializedProperty it = so.GetIterator();
                bool enter = true;
                while (it.Next(enter))
                {
                    enter = it.propertyType != SerializedPropertyType.String;
                    if (it.propertyType != SerializedPropertyType.ObjectReference) continue;
                    UnityEngine.Object o = it.objectReferenceValue;
                    if (o is ScriptableObject && !(o is RenderPipelineAsset))
                    {
                        renderers.Add(new JMap()
                            .Set("referencedBy", it.propertyPath)
                            .Set("asset", SerializedDump.Reference(o))
                            .Set("serialized", SerializedDump.Dump(o)));
                    }
                }
                env.Set("pipelineReferencedAssets", renderers);
            }

            env.Set("postProcessingAssets", PostProcessingAssets(log));
            return env;
        }

        /// <summary>
        /// Volume profiles (URP / HDRP) and post-processing stack v2 profiles in the project, with
        /// every component they hold dumped in full.
        /// </summary>
        private static List<object> PostProcessingAssets(ParityLog log)
        {
            var result = new List<object>();
            foreach (string query in new[] { "t:VolumeProfile", "t:PostProcessProfile" })
            {
                foreach (string guid in AssetDatabase.FindAssets(query))
                {
                    string path = AssetDatabase.GUIDToAssetPath(guid);
                    var components = new List<object>();
                    foreach (UnityEngine.Object sub in AssetDatabase.LoadAllAssetsAtPath(path))
                    {
                        if (sub == null) continue;
                        components.Add(new JMap()
                            .Set("type", sub.GetType().FullName)
                            .Set("name", sub.name)
                            .Set("serialized", SerializedDump.Dump(sub)));
                    }
                    result.Add(new JMap().Set("query", query).Set("path", path).Set("objects", components));
                }
            }
            log.Note("post-processing assets found: " + result.Count);
            return result;
        }

        /// <summary>Copies ProjectSettings/*.asset — small, and the raw form of everything above.</summary>
        public static void CopyProjectSettings(string outDir)
        {
            string src = Path.Combine(Directory.GetCurrentDirectory(), "ProjectSettings");
            if (!Directory.Exists(src)) return;
            string dst = Path.Combine(outDir, "ProjectSettings");
            Directory.CreateDirectory(dst);
            foreach (string file in Directory.GetFiles(src))
            {
                var info = new FileInfo(file);
                if (info.Length > 4 * 1024 * 1024) continue;
                File.Copy(file, Path.Combine(dst, info.Name), true);
            }
            string manifest = Path.Combine(Directory.GetCurrentDirectory(), "Packages", "manifest.json");
            if (File.Exists(manifest)) File.Copy(manifest, Path.Combine(dst, "Packages-manifest.json"), true);
        }

        /// <summary>A type by its full name from whichever loaded assembly defines it, or null.</summary>
        public static Type FindType(string fullName)
        {
            foreach (Assembly a in AppDomain.CurrentDomain.GetAssemblies())
            {
                Type t = a.GetType(fullName, false);
                if (t != null) return t;
            }
            return null;
        }

        /// <summary>Sets a public field or property by name through reflection; false when absent.</summary>
        public static bool SetMember(object target, string member, object value)
        {
            if (target == null) return false;
            Type t = target.GetType();
            PropertyInfo p = t.GetProperty(member, BindingFlags.Public | BindingFlags.Instance);
            if (p != null && p.CanWrite)
            {
                p.SetValue(target, value);
                return true;
            }
            FieldInfo f = t.GetField(member, BindingFlags.Public | BindingFlags.Instance);
            if (f != null)
            {
                f.SetValue(target, value);
                return true;
            }
            return false;
        }
    }
}
