using UnityEditor;

namespace BabylonQuarks.UnityExporter
{
    /// <summary>
    /// Exporter settings, persisted per user in EditorPrefs so the menu commands and the
    /// exporter window share them.
    /// </summary>
    public class ExportOptions
    {
        private const string Prefix = "BabylonQuarks.UnityExporter.";

        /// <summary>Write textures as image files under <see cref="AssetsFolder"/> instead of data URIs.</summary>
        public bool TexturesAsFiles;

        /// <summary>Write mesh geometries as <c>.json</c> files under <see cref="AssetsFolder"/> instead of inline.</summary>
        public bool GeometriesAsFiles;

        /// <summary>
        /// Folder name, next to the exported effect (or at the root of a folder export), that
        /// holds the asset files. Every effect of a folder export shares it.
        /// </summary>
        public string AssetsFolder = "assets";

        public bool AnyAsFiles => TexturesAsFiles || GeometriesAsFiles;

        public static ExportOptions Load() => new ExportOptions
        {
            TexturesAsFiles = EditorPrefs.GetBool(Prefix + "TexturesAsFiles", false),
            GeometriesAsFiles = EditorPrefs.GetBool(Prefix + "GeometriesAsFiles", false),
            AssetsFolder = EditorPrefs.GetString(Prefix + "AssetsFolder", "assets"),
        };

        public void Save()
        {
            EditorPrefs.SetBool(Prefix + "TexturesAsFiles", TexturesAsFiles);
            EditorPrefs.SetBool(Prefix + "GeometriesAsFiles", GeometriesAsFiles);
            EditorPrefs.SetString(Prefix + "AssetsFolder", AssetsFolder);
        }

        /// <summary>Folder name to write into; falls back to "assets" when left blank.</summary>
        public string AssetsFolderOrDefault =>
            string.IsNullOrWhiteSpace(AssetsFolder) ? "assets" : AssetsFolder.Trim().Trim('/', '\\');
    }
}
