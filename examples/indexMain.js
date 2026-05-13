import {demoManifest} from "./babylon/demoManifest.js";

function loadHeroBackground() {
    import("./indexHeroBackground.js")
        .then(({mountIndexHeroBackground}) => {
            mountIndexHeroBackground();
        })
        .catch((err) => {
            console.warn("Hero background could not start:", err);
        });
}

if (typeof window !== "undefined") {
    window.requestAnimationFrame(() => loadHeroBackground());
}

const demosContainer = document.getElementById("demos");
const searchInput = document.getElementById("search");
const statsText = document.getElementById("stats");

/**
 * Builds deterministic preview filename from demo key.
 */
function getPreviewFilename(demoKey) {
  return demoKey
    .replace(/Demo$/u, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

/**
 * Builds the demo card markup for the gallery.
 */
function createDemoCard(demo) {
  const previewGradient = demo.preview?.gradient ?? "linear-gradient(135deg, #4d6dbd 0%, #26385f 100%)";
  const previewImagePath = `./previews/${getPreviewFilename(demo.key)}.png`;
  const tags = demo.tags
    .map((tag) => `<span class="tag">${tag}</span>`)
    .join("");
  return `
    <article class="card">
      <div class="preview" style="background:${previewGradient}">
        <img class="preview-image" src="${previewImagePath}" alt="${demo.name} preview" loading="lazy" />
      </div>
      <h3>${demo.name}</h3>
      <p>${demo.description}</p>
      <div class="tags">${tags}</div>
      <a class="open-link" href="./babylonDemo.html#${demo.key}">Open demo</a>
    </article>
  `;
}

/**
 * Filters demos by text query over names and tags.
 */
function filterDemos(query) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return demoManifest;
  }
  return demoManifest.filter((demo) => {
    const searchableText = `${demo.name} ${demo.tags.join(" ")}`.toLowerCase();
    return searchableText.includes(normalizedQuery);
  });
}

/**
 * Renders filtered gallery content and count summary.
 */
function renderDemos(query = "") {
  const filteredDemos = filterDemos(query);
  demosContainer.innerHTML = filteredDemos.map(createDemoCard).join("");
  statsText.textContent = `${filteredDemos.length} / ${demoManifest.length} demos`;
}

searchInput.addEventListener("input", (event) => {
  renderDemos(event.target.value);
});

renderDemos();
