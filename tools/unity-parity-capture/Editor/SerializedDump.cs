using System;
using UnityEditor;
using UnityEngine;

namespace BabylonQuarks.ParityCapture
{
    /// <summary>
    /// Flattens any Unity object's serialized state into { propertyPath: value }. Generic on
    /// purpose: it records what Unity actually stores (pipeline assets, volume components, shader
    /// state) without the tool having to know — or guess — which fields matter.
    /// </summary>
    internal static class SerializedDump
    {
        /// <param name="keep">Which leaf paths to record; null keeps everything.</param>
        /// <param name="descend">Which paths to walk into; null walks everything.</param>
        public static JMap Dump(UnityEngine.Object target, Func<string, bool> keep = null,
            Func<string, bool> descend = null, int maxLeaves = 6000, int maxArray = 256)
        {
            var result = new JMap();
            if (target == null) return result;

            var so = new SerializedObject(target);
            SerializedProperty it = so.GetIterator();
            int leaves = 0;
            int visited = 0;
            bool enter = true;
            while (it.Next(enter))
            {
                if (++visited > 200000)
                {
                    result.Set("__truncated", "visited limit");
                    break;
                }
                string path = it.propertyPath;
                // Vector3, Color, Rect… have children too, but they are recorded whole as leaves.
                enter = it.hasChildren && it.propertyType == SerializedPropertyType.Generic
                        && (descend == null || descend(path));

                // Strings are char arrays underneath; big arrays are mesh / texture payloads.
                if (it.propertyType == SerializedPropertyType.String) enter = false;
                if (it.isArray && it.propertyType == SerializedPropertyType.Generic && it.arraySize > maxArray)
                {
                    if (keep == null || keep(path)) result.Set(path, "[array of " + it.arraySize + "]");
                    enter = false;
                    continue;
                }

                if (it.hasChildren && it.propertyType == SerializedPropertyType.Generic) continue;
                if (keep != null && !keep(path)) continue;

                object value = Leaf(it);
                if (value == null) continue;
                result.Set(path, value);
                if (++leaves >= maxLeaves)
                {
                    result.Set("__truncated", "leaf limit " + maxLeaves);
                    break;
                }
            }
            return result;
        }

        /// <summary>The top-level serialized property names, for seeing what an object stores at all.</summary>
        public static string[] TopLevel(UnityEngine.Object target)
        {
            if (target == null) return new string[0];
            var names = new System.Collections.Generic.List<string>();
            var so = new SerializedObject(target);
            SerializedProperty it = so.GetIterator();
            bool enter = true;
            while (it.Next(enter))
            {
                enter = false;
                names.Add(it.propertyPath);
                if (names.Count > 500) break;
            }
            return names.ToArray();
        }

        private static object Leaf(SerializedProperty p)
        {
            switch (p.propertyType)
            {
                case SerializedPropertyType.Integer:
                case SerializedPropertyType.LayerMask:
                case SerializedPropertyType.Character:
                case SerializedPropertyType.ArraySize:
                    return p.longValue;
                case SerializedPropertyType.Boolean: return p.boolValue;
                case SerializedPropertyType.Float: return p.doubleValue;
                case SerializedPropertyType.String: return p.stringValue;
                case SerializedPropertyType.Color: return p.colorValue;
                case SerializedPropertyType.Vector2: return p.vector2Value;
                case SerializedPropertyType.Vector3: return p.vector3Value;
                case SerializedPropertyType.Vector4: return p.vector4Value;
                case SerializedPropertyType.Quaternion: return p.quaternionValue;
                case SerializedPropertyType.Rect:
                    Rect r = p.rectValue;
                    return new[] { r.x, r.y, r.width, r.height };
                case SerializedPropertyType.Bounds:
                    Bounds b = p.boundsValue;
                    return new JMap().Set("center", b.center).Set("size", b.size);
                case SerializedPropertyType.Enum:
                    int index = p.enumValueIndex;
                    string[] names = p.enumNames;
                    return new JMap().Set("value", p.intValue)
                        .Set("name", index >= 0 && index < names.Length ? names[index] : null);
                case SerializedPropertyType.ObjectReference:
                    return Reference(p.objectReferenceValue);
                case SerializedPropertyType.AnimationCurve:
                    AnimationCurve curve = p.animationCurveValue;
                    if (curve == null) return null;
                    var keys = new System.Collections.Generic.List<object>();
                    foreach (Keyframe k in curve.keys)
                    {
                        keys.Add(new[] { k.time, k.value, k.inTangent, k.outTangent });
                    }
                    return new JMap().Set("keys[time,value,in,out]", keys);
                default:
                    return null;
            }
        }

        public static object Reference(UnityEngine.Object o)
        {
            if (o == null) return null;
            string path = AssetDatabase.GetAssetPath(o);
            var map = new JMap().Set("type", o.GetType().FullName).Set("name", o.name);
            if (!string.IsNullOrEmpty(path)) map.Set("path", path);
            if (AssetDatabase.TryGetGUIDAndLocalFileIdentifier(o, out string guid, out long localId))
            {
                map.Set("guid", guid).Set("localId", localId);
            }
            return map;
        }
    }
}
