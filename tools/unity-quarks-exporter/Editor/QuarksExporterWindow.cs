using UnityEditor;
using UnityEngine;

namespace BabylonQuarks.UnityExporter
{
    /// <summary>
    /// Exporter settings window. The toggles are saved to EditorPrefs, so the Tools → Quarks menu
    /// commands use them as well.
    /// </summary>
    public class QuarksExporterWindow : EditorWindow
    {
        private ExportOptions _options;

        [MenuItem("Tools/Quarks/Exporter Settings…", false, 0)]
        public static void Open()
        {
            var window = GetWindow<QuarksExporterWindow>(true, "Quarks Exporter");
            window.minSize = new Vector2(360, 230);
            window.Show();
        }

        private void OnEnable()
        {
            _options = ExportOptions.Load();
        }

        private void OnGUI()
        {
            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Assets as files", EditorStyles.boldLabel);
            EditorGUILayout.HelpBox(
                "Off: everything is embedded and each .json is self-contained.\n" +
                "On: the asset is written once into a shared folder and effects reference it by a relative url — " +
                "load them over http with QuarksLoader.load(), or import the whole output folder in the editor.",
                MessageType.None);

            EditorGUI.BeginChangeCheck();
            _options.TexturesAsFiles = EditorGUILayout.ToggleLeft(
                new GUIContent("Export textures as files", "Textures (and baked reflection atlases) become .png/.jpg/.webp files."),
                _options.TexturesAsFiles);
            _options.GeometriesAsFiles = EditorGUILayout.ToggleLeft(
                new GUIContent("Export geometries as files", "Mesh particles and mesh-shape emitters reference a geometry .json file."),
                _options.GeometriesAsFiles);
            using (new EditorGUI.DisabledScope(!_options.AnyAsFiles))
            {
                _options.AssetsFolder = EditorGUILayout.TextField(
                    new GUIContent("Assets folder", "Created next to the exported .json, or at the root of a folder export."),
                    _options.AssetsFolder);
            }
            if (EditorGUI.EndChangeCheck())
            {
                _options.Save();
            }

            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Export", EditorStyles.boldLabel);
            using (new EditorGUI.DisabledScope(Selection.activeGameObject == null))
            {
                if (GUILayout.Button("Export Selected Effect…"))
                {
                    QuarksExporter.ExportSelected();
                    GUIUtility.ExitGUI();
                }
            }
            if (GUILayout.Button("Export Folder of Effects…"))
            {
                QuarksExporter.ExportSelectedFolder();
                GUIUtility.ExitGUI();
            }
        }

        private void OnSelectionChange() => Repaint();
    }
}
