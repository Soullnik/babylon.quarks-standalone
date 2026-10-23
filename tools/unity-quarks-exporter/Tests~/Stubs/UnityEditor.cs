// The UnityEditor API the exporter calls. Dialogs and menus do nothing; AssetDatabase reports the
// test hook Texture.assetPath. See UnityEngine.Math.cs.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace UnityEditor
{
    [AttributeUsage(AttributeTargets.Method, AllowMultiple = true)]
    public sealed class MenuItem : Attribute
    {
        public MenuItem(string itemName) { }
        public MenuItem(string itemName, bool isValidateFunction) { }
        public MenuItem(string itemName, bool isValidateFunction, int priority) { }
    }

    public static class EditorUtility
    {
        public static bool DisplayDialog(string title, string message, string ok) => true;
        public static string SaveFilePanel(string title, string directory, string defaultName, string extension) => "";
        public static string OpenFolderPanel(string title, string folder, string defaultName) => "";
        public static bool DisplayCancelableProgressBar(string title, string info, float progress) => false;
        public static void ClearProgressBar() { }
        public static void RevealInFinder(string path) { }
    }

    public static class AssetDatabase
    {
        public static string GetAssetPath(UnityEngine.Object assetObject) =>
            assetObject is Texture texture && texture.assetPath != null ? texture.assetPath : "";

        public static string[] FindAssets(string filter, string[] searchInFolders) => new string[0];
        public static string GUIDToAssetPath(string guid) => "";
        public static T LoadAssetAtPath<T>(string assetPath) where T : UnityEngine.Object => null;
        public static bool IsValidFolder(string path) => false;
    }

    public static class Selection
    {
        public static GameObject activeGameObject { get; set; }
        public static UnityEngine.Object activeObject { get; set; }
    }

    public static class PrefabUtility
    {
        public static UnityEngine.Object InstantiatePrefab(UnityEngine.Object assetComponentOrGameObject) => assetComponentOrGameObject;
    }

    public static class EditorPrefs
    {
        private static readonly Dictionary<string, object> Values = new Dictionary<string, object>();
        public static bool GetBool(string key, bool defaultValue) => Values.TryGetValue(key, out var v) ? (bool)v : defaultValue;
        public static void SetBool(string key, bool value) => Values[key] = value;
        public static string GetString(string key, string defaultValue) => Values.TryGetValue(key, out var v) ? (string)v : defaultValue;
        public static void SetString(string key, string value) => Values[key] = value;
    }

    public enum MessageType { None = 0, Info = 1, Warning = 2, Error = 3 }

    public class EditorWindow : ScriptableObject
    {
        public Vector2 minSize { get; set; }
        public static T GetWindow<T>(bool utility, string title) where T : EditorWindow, new() => new T();
        public void Show() { }
        public void Repaint() { }
    }

    public static class EditorStyles
    {
        public static GUIStyle boldLabel => new GUIStyle();
    }

    public static class EditorGUILayout
    {
        public static void Space() { }
        public static void LabelField(string label, GUIStyle style, params GUILayoutOption[] options) { }
        public static void HelpBox(string message, MessageType type) { }
        public static bool ToggleLeft(GUIContent label, bool value, params GUILayoutOption[] options) => value;
        public static string TextField(GUIContent label, string text, params GUILayoutOption[] options) => text;
    }

    public static class EditorGUI
    {
        public static void BeginChangeCheck() { }
        public static bool EndChangeCheck() => false;

        public struct DisabledScope : IDisposable
        {
            public DisabledScope(bool disabled) { }
            public void Dispose() { }
        }
    }
}
