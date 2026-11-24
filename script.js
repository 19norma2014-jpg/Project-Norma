const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const authScreen = $("#auth-screen");
const dashboard = $("#dashboard");
const authForm = $("#auth-form");
const authToggle = $("#auth-toggle");
const authTitle = $("#auth-title");
const authKicker = $("#auth-kicker");
const authSubmit = $("#auth-submit");
let isSignup = false;

function setAuthenticated(username) {
  localStorage.setItem("toonforge-user", username);
  $("#welcome-name").textContent = username;
  $("#avatar-button").textContent = username.charAt(0).toUpperCase();
  authScreen.classList.add("hidden");
  dashboard.classList.remove("hidden");
  renderProjects();
}

authToggle.addEventListener("click", () => {
  isSignup = !isSignup;
  authTitle.textContent = isSignup ? "Create your studio" : "Log in to your studio";
  authKicker.textContent = isSignup ? "JOIN TOONFORGE" : "WELCOME BACK";
  authSubmit.innerHTML = isSignup ? "Sign up <span>→</span>" : "Log in <span>→</span>";
  authToggle.textContent = isSignup ? "Already have an account? Log in" : "Create an account";
  $("#password").autocomplete = isSignup ? "new-password" : "current-password";
});

authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const username = $("#username").value.trim();
  const password = $("#password").value;
  if (!username || !password) return;
  setAuthenticated(username);
});

$("#logout-button").addEventListener("click", () => {
  localStorage.removeItem("toonforge-user");
  dashboard.classList.add("hidden");
  $("#editor").classList.add("hidden");
  authScreen.classList.remove("hidden");
  authForm.reset();
});

const today = new Date();
$("#today-label").textContent = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

let projects = JSON.parse(localStorage.getItem("toonforge-projects") || "[]");

function persistProjects() {
  localStorage.setItem("toonforge-projects", JSON.stringify(projects));
}

function renderProjects() {
  const grid = $("#project-grid");
  grid.innerHTML = "";
  projects.forEach((project, index) => {
    const card = document.createElement("article");
    card.className = `project-card ${project.type}`;
    card.innerHTML = `
      <button data-project-index="${index}">
        <div class="project-preview"><span class="preview-shape">${project.type === "comic" ? "▤" : "🧍"}</span></div>
        <div class="project-meta"><strong>${escapeHtml(project.name)}</strong><small>${project.type === "comic" ? "Comic strip" : "Animation"} · Edited today</small></div>
      </button>`;
    grid.appendChild(card);
  });
  const addCard = document.createElement("button");
  addCard.className = "add-project-card";
  addCard.innerHTML = "<div><span>＋</span><small>New project</small></div>";
  addCard.addEventListener("click", openProjectModal);
  grid.appendChild(addCard);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[char]));
}

const projectModal = $("#project-modal");
function openProjectModal() { projectModal.classList.remove("hidden"); }
function closeProjectModal() { projectModal.classList.add("hidden"); }
$("#new-project-button").addEventListener("click", openProjectModal);
$$("[data-close-modal]").forEach(button => button.addEventListener("click", closeProjectModal));
projectModal.addEventListener("click", event => {
  if (event.target === projectModal) closeProjectModal();
});

$$("[data-project-type]").forEach(button => {
  button.addEventListener("click", () => createProject(button.dataset.projectType));
});

function createProject(type) {
  const name = type === "comic" ? "Untitled comic" : "Untitled animation";
  const project = { id: Date.now(), name, type, frames: [] };
  projects.unshift(project);
  persistProjects();
  closeProjectModal();
  openEditor(project);
}

$("#project-grid").addEventListener("click", event => {
  const button = event.target.closest("[data-project-index]");
  if (!button) return;
  openEditor(projects[Number(button.dataset.projectIndex)]);
});

$$(".nav-item").forEach(button => {
  button.addEventListener("click", () => {
    $$(".nav-item").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    $(".projects-view").classList.remove("hidden");
    $(".section-heading h2").textContent = button.dataset.view === "projects"
      ? "Recent projects"
      : button.dataset.view === "gallery" ? "My Gallery" : "Favorites";
  });
});

const editor = $("#editor");
let currentProject = null;
let selectedFrameIndex = 0;
let selectedLayerId = null;
let selectedObjectId = null;
let playbackTimer = null;
let createdLayerCount = 0;

function openEditor(project) {
  stopPlayback();
  currentProject = project;
  dashboard.classList.add("hidden");
  editor.classList.remove("hidden");
  $("#project-name").value = project.name;
  $("#editor-project-icon").textContent = project.type === "comic" ? "▤" : "▶";
  $("#asset-title").textContent = project.type === "comic" ? "Characters & props" : "Puppet presets";
  renderPresets(project.type);
  if (!Array.isArray(project.frames) || !project.frames.length) {
    project.frames = [defaultFrame()];
  }
  ensureProjectLayers(project);
  selectedFrameIndex = 0;
  selectedLayerId = project.type === "comic" ? "drawing" : "puppet";
  undoStack = [];
  redoStack = [];
  renderStageLayers();
  renderLayerList();
  renderFrames();
  setActiveTool("select");
  requestAnimationFrame(() => {
    resizeCanvas(false);
    loadFrame(0, false);
  });
}

function renderPresets(type) {
  const presets = type === "comic"
    ? [
        { icon: "●︵●", label: "Neutral face", expression: "neutral" },
        { icon: "◕‿◕", label: "Happy face", expression: "happy" },
        { icon: "💬", label: "Speech bubble", kind: "object" },
        { icon: "✦", label: "Sparkle", kind: "object" },
        { icon: "★", label: "Star", kind: "object" },
        { icon: "☁", label: "Cloud", kind: "object" }
      ]
    : [
        { icon: "😊", label: "Happy", expression: "happy" },
        { icon: "😮", label: "Surprised", expression: "surprised" },
        { icon: "😢", label: "Sad", expression: "sad" },
        { icon: "😠", label: "Angry", expression: "angry" },
        { icon: "💬", label: "Speech bubble", kind: "object" },
        { icon: "⚡", label: "Lightning", kind: "object" }
      ];
  $("#preset-grid").innerHTML = presets.map((preset, index) =>
    `<button class="preset" type="button" title="${preset.label}" aria-label="${preset.label}" data-preset-index="${index}" data-expression="${preset.expression || ""}">${preset.icon}</button>`
  ).join("");
  $$(".preset", $("#preset-grid")).forEach((button, index) => {
    button.addEventListener("click", () => {
      if (presets[index].expression) {
        applyExpression(presets[index].expression);
        saveCurrentFrame();
      } else {
        addStageObject(presets[index].icon, presets[index].label);
      }
    });
  });
}

$("#back-to-dashboard").addEventListener("click", () => {
  stopPlayback();
  saveCurrentFrame();
  editor.classList.add("hidden");
  dashboard.classList.remove("hidden");
  renderProjects();
});

$("#save-project").addEventListener("click", () => {
  if (!currentProject) return;
  currentProject.name = $("#project-name").value.trim() || "Untitled project";
  persistProjects();
  $("#saved-status").textContent = "Saved just now";
  setTimeout(() => $("#saved-status").textContent = "Saved", 1800);
});

$("#project-name").addEventListener("input", () => {
  if (!currentProject) return;
  currentProject.name = $("#project-name").value.trim() || "Untitled project";
  persistProjects();
  $("#saved-status").textContent = "Saved";
});

let activeTool = "select";
let drawing = false;
let undoStack = [];
let redoStack = [];
let canvasRestoreId = 0;
let layerCanvases = new Map();
const defaultPose = {
  "left-arm": "M190 155 L110 215",
  "right-arm": "M190 155 L270 215",
  "left-leg": "M190 260 L130 350",
  "right-leg": "M190 260 L250 350"
};

function ensureProjectLayers(project) {
  let changed = false;
  if (!Array.isArray(project.layers) || !project.layers.length) {
    const puppet = { id: "puppet", name: "Puppet", type: "puppet", visible: true, opacity: 100, size: 100 };
    const drawing = { id: "drawing", name: "Drawing", type: "drawing", visible: true, opacity: 100, size: 100 };
    const background = { id: "background", name: "Background", type: "drawing", visible: true, opacity: 100, size: 100 };
    project.layers = project.type === "comic" ? [drawing, puppet, background] : [puppet, drawing, background];
    changed = true;
  } else {
    project.layers = project.layers.map(layer => {
      if (layer.visible === undefined || layer.opacity === undefined || layer.size === undefined || !layer.type) changed = true;
      return {
        type: "drawing",
        visible: true,
        opacity: 100,
        size: 100,
        ...layer
      };
    });
  }
  project.frames.forEach(frame => {
    if (!frame.layerDrawings) {
      frame.layerDrawings = {};
      if (frame.drawing) frame.layerDrawings.drawing = frame.drawing;
      changed = true;
    }
    if (!Array.isArray(frame.objects)) {
      frame.objects = [];
      changed = true;
    }
  });
  if (changed) persistProjects();
}

function renderStageLayers() {
  const stageLayers = $("#stage-layers");
  const puppetTemplate = $("#puppet-template");
  stageLayers.replaceChildren();
  layerCanvases = new Map();
  currentProject.layers.forEach((layer, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = `stage-layer${layer.type === "puppet" ? " puppet-layer" : ""}`;
    wrapper.dataset.layerId = layer.id;
    wrapper.dataset.layerType = layer.type;
    wrapper.dataset.selected = String(layer.id === selectedLayerId);
    wrapper.style.zIndex = String(currentProject.layers.length - index);

    if (layer.type === "puppet") {
      const puppet = puppetTemplate.content.firstElementChild.cloneNode(true);
      wrapper.appendChild(puppet);
      attachPuppetInteractions(puppet);
    } else {
      const canvas = document.createElement("canvas");
      canvas.className = "layer-canvas";
      canvas.dataset.layerId = layer.id;
      wrapper.appendChild(canvas);
      layerCanvases.set(layer.id, canvas);
      attachDrawingEvents(canvas);
    }

    stageLayers.appendChild(wrapper);
    applyLayerProperties(layer);
  });
  $("#stage").dataset.activeLayer = selectedLayerId || "";
}

function applyLayerProperties(layer) {
  const wrapper = $(`.stage-layer[data-layer-id="${layer.id}"]`);
  if (!wrapper) return;
  wrapper.style.display = layer.visible ? "" : "none";
  wrapper.style.opacity = String(layer.opacity / 100);
  wrapper.style.transform = `scale(${layer.size / 100})`;
  wrapper.dataset.selected = String(layer.id === selectedLayerId);
}

function renderLayerList() {
  const list = $("#layer-list");
  list.replaceChildren();
  currentProject.layers.forEach(layer => {
    const row = document.createElement("div");
    row.className = `layer${layer.id === selectedLayerId ? " active" : ""}`;
    row.dataset.layerId = layer.id;
    row.draggable = true;
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", String(layer.id === selectedLayerId));
    row.tabIndex = 0;
    row.innerHTML = `<span class="layer-thumb">${layer.type === "puppet" ? "●" : "▧"}</span><span class="layer-name"></span><button class="layer-visibility" type="button" aria-label="${layer.visible ? "Hide" : "Show"} ${layer.name}" title="${layer.visible ? "Hide" : "Show"} layer">${layer.visible ? "◉" : "○"}</button>`;
    $(".layer-name", row).textContent = layer.name;
    list.appendChild(row);
  });
  updateLayerProperties();
}

function updateLayerProperties() {
  const layer = currentProject?.layers.find(item => item.id === selectedLayerId);
  if (!layer) return;
  $("#layer-opacity").value = layer.opacity;
  $("#layer-opacity-value").value = `${layer.opacity}%`;
  $("#layer-size").value = layer.size;
  $("#layer-size-value").value = `${layer.size}%`;
  $("#stage").dataset.activeLayer = layer.id;
}

function selectLayer(layerId) {
  if (!currentProject?.layers.some(layer => layer.id === layerId)) return;
  selectedLayerId = layerId;
  const selected = currentProject.layers.find(layer => layer.id === layerId);
  if (activeTool !== "select" && selected.type === "puppet") setActiveTool("select");
  undoStack = [];
  redoStack = [];
  currentProject.layers.forEach(applyLayerProperties);
  renderLayerList();
}

function reorderLayers(draggedId, targetId, placeAfter) {
  if (draggedId === targetId) return;
  saveCurrentFrame();
  const from = currentProject.layers.findIndex(layer => layer.id === draggedId);
  const target = currentProject.layers.findIndex(layer => layer.id === targetId);
  if (from < 0 || target < 0) return;
  const [layer] = currentProject.layers.splice(from, 1);
  let insertAt = target + (placeAfter ? 1 : 0);
  if (from < insertAt) insertAt--;
  currentProject.layers.splice(insertAt, 0, layer);
  persistProjects();
  renderStageLayers();
  renderLayerList();
  requestAnimationFrame(() => {
    resizeCanvas(false);
    loadFrame(selectedFrameIndex, false);
  });
}

let draggedLayerId = null;
$("#layer-list").addEventListener("click", event => {
  const row = event.target.closest(".layer");
  if (!row) return;
  const layer = currentProject.layers.find(item => item.id === row.dataset.layerId);
  if (!layer) return;
  if (event.target.closest(".layer-visibility")) {
    layer.visible = !layer.visible;
    if (!layer.visible && selectedLayerId === layer.id) {
      selectedLayerId = currentProject.layers.find(item => item.visible && item.id !== layer.id)?.id || null;
    }
    persistProjects();
    currentProject.layers.forEach(applyLayerProperties);
    renderLayerList();
    return;
  }
  selectLayer(layer.id);
});

$("#layer-list").addEventListener("keydown", event => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const row = event.target.closest(".layer");
  if (row && !event.target.closest(".layer-visibility")) {
    event.preventDefault();
    selectLayer(row.dataset.layerId);
  }
});

$("#layer-list").addEventListener("dragstart", event => {
  const row = event.target.closest(".layer");
  if (!row || event.target.closest(".layer-visibility")) {
    event.preventDefault();
    return;
  }
  draggedLayerId = row.dataset.layerId;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedLayerId);
});

$("#layer-list").addEventListener("dragover", event => {
  const row = event.target.closest(".layer");
  if (!row || !draggedLayerId) return;
  event.preventDefault();
  row.classList.add("drag-over");
  event.dataTransfer.dropEffect = "move";
});

$("#layer-list").addEventListener("drop", event => {
  const row = event.target.closest(".layer");
  if (!row || !draggedLayerId) return;
  event.preventDefault();
  const bounds = row.getBoundingClientRect();
  const placeAfter = event.clientY > bounds.top + bounds.height / 2;
  reorderLayers(draggedLayerId, row.dataset.layerId, placeAfter);
  draggedLayerId = null;
});

$("#layer-list").addEventListener("dragleave", event => {
  event.target.closest(".layer")?.classList.remove("drag-over");
});
$("#layer-list").addEventListener("dragend", () => {
  draggedLayerId = null;
  $$(".layer.drag-over").forEach(row => row.classList.remove("drag-over"));
});

$("#layer-opacity").addEventListener("input", event => {
  const layer = currentProject?.layers.find(item => item.id === selectedLayerId);
  if (!layer) return;
  layer.opacity = Number(event.target.value);
  applyLayerProperties(layer);
  $("#layer-opacity-value").value = `${layer.opacity}%`;
  persistProjects();
});

$("#layer-size").addEventListener("input", event => {
  const layer = currentProject?.layers.find(item => item.id === selectedLayerId);
  if (!layer) return;
  layer.size = Number(event.target.value);
  applyLayerProperties(layer);
  $("#layer-size-value").value = `${layer.size}%`;
  persistProjects();
});

function setActiveTool(toolName) {
  activeTool = toolName;
  if (toolName !== "select" && currentProject?.layers?.find(layer => layer.id === selectedLayerId)?.type === "puppet") {
    selectLayer(currentProject.layers.find(layer => layer.type !== "puppet")?.id);
  }
  $$(".tool").forEach(tool => tool.classList.toggle("active", tool.dataset.tool === toolName));
  $("#stage").dataset.tool = toolName;
}

$$(".tool").forEach(tool => tool.addEventListener("click", () => setActiveTool(tool.dataset.tool)));

function defaultFrame() {
  return { pose: { ...defaultPose }, expression: "happy", layerDrawings: {}, objects: [] };
}

function captureFrame() {
  const pose = {};
  $$(".limb").forEach(limb => { pose[limb.dataset.limb] = limb.getAttribute("d"); });
  const layerDrawings = {};
  layerCanvases.forEach((canvas, layerId) => {
    layerDrawings[layerId] = canvas.toDataURL();
  });
  const objects = currentProject?.frames?.[selectedFrameIndex]?.objects || [];
  return {
    pose,
    expression: $("#puppet").dataset.expression || "happy",
    layerDrawings,
    objects: JSON.parse(JSON.stringify(objects))
  };
}

function saveCurrentFrame() {
  if (!currentProject || !currentProject.frames?.[selectedFrameIndex]) return;
  currentProject.frames[selectedFrameIndex] = captureFrame();
  persistProjects();
}

function applyPose(pose = {}) {
  $$(".limb").forEach(limb => {
    const path = pose[limb.dataset.limb] || defaultPose[limb.dataset.limb];
    limb.setAttribute("d", path);
  });
}

const expressions = {
  neutral: { eyeRadius: 5, mouth: "M176 112 Q190 112 204 112", mouthWidth: 5 },
  happy: { eyeRadius: 5, mouth: "M176 108 Q190 130 204 108", mouthWidth: 5 },
  surprised: { eyeRadius: 7, mouth: "M184 111 Q190 111 196 111", mouthWidth: 9 },
  sad: { eyeRadius: 5, mouth: "M176 120 Q190 104 204 120", mouthWidth: 5 },
  angry: { eyeRadius: 4, mouth: "M176 120 Q190 106 204 120", mouthWidth: 6 }
};

function applyExpression(name = "happy") {
  const expression = expressions[name] || expressions.happy;
  $("#puppet").dataset.expression = name;
  $("#left-eye").setAttribute("r", expression.eyeRadius);
  $("#right-eye").setAttribute("r", expression.eyeRadius);
  $("#mouth").setAttribute("d", expression.mouth);
  $("#mouth").setAttribute("stroke-width", expression.mouthWidth);
  $$(".preset[data-expression]").forEach(button => {
    button.classList.toggle("active", button.dataset.expression === name);
  });
}

function renderFrames() {
  const strip = $("#frame-strip");
  strip.innerHTML = "";
  currentProject.frames.forEach((frame, index) => {
    const button = document.createElement("button");
    button.className = `frame${index === selectedFrameIndex ? " active" : ""}`;
    button.type = "button";
    button.dataset.frameIndex = index;
    button.setAttribute("aria-label", `Frame ${index + 1}`);
    button.innerHTML = `<span>${index + 1}</span><i></i>`;
    strip.appendChild(button);
  });
  const addButton = document.createElement("button");
  addButton.className = "add-frame";
  addButton.id = "add-frame";
  addButton.type = "button";
  addButton.setAttribute("aria-label", "Add frame");
  addButton.textContent = "＋";
  strip.appendChild(addButton);
}

function loadFrame(index, saveCurrent = true) {
  if (!currentProject?.frames?.[index]) return;
  if (saveCurrent) saveCurrentFrame();
  selectedFrameIndex = index;
  selectedObjectId = null;
  undoStack = [];
  redoStack = [];
  const frame = currentProject.frames[index];
  applyPose(frame.pose);
  applyExpression(frame.expression);
  restoreFrameDrawings(frame.layerDrawings || { drawing: frame.drawing });
  renderFrameObjects(frame.objects || []);
  renderFrames();
  updateObjectProperties();
}

function selectFrame(index) {
  if (!currentProject || index < 0 || index >= currentProject.frames.length) return;
  loadFrame(index);
}

function getCurrentFrameObjects() {
  const frame = currentProject?.frames?.[selectedFrameIndex];
  if (!frame) return [];
  frame.objects ||= [];
  return frame.objects;
}

function getSelectedObject() {
  return getCurrentFrameObjects().find(object => object.id === selectedObjectId) || null;
}

function applyStageObjectStyle(element, object) {
  element.style.setProperty("--object-x", `${object.x}%`);
  element.style.setProperty("--object-y", `${object.y}%`);
  element.style.setProperty("--object-size", String(object.size / 100));
  element.style.setProperty("--object-rotation", `${object.rotation}deg`);
}

function updateObjectProperties() {
  const object = getSelectedObject();
  $("#object-properties").classList.toggle("hidden", !object);
  if (!object) return;
  $("#object-size").value = object.size;
  $("#object-size-value").value = `${object.size}%`;
  $("#object-rotation").value = object.rotation;
  $("#object-rotation-value").value = `${object.rotation}°`;
}

function selectObject(objectId) {
  selectedObjectId = objectId;
  $$(".stage-object").forEach(element => {
    element.classList.toggle("selected", element.dataset.objectId === objectId);
  });
  updateObjectProperties();
}

function renderFrameObjects(objects) {
  $$(".stage-object", $("#stage-layers")).forEach(element => element.remove());
  objects.forEach(object => {
    let layer = currentProject.layers.find(item => item.id === object.layerId && item.type !== "puppet");
    if (!layer) layer = currentProject.layers.find(item => item.type !== "puppet");
    if (!layer) return;
    object.layerId = layer.id;
    const wrapper = $(`.stage-layer[data-layer-id="${layer.id}"]`);
    if (!wrapper) return;
    const element = document.createElement("button");
    element.type = "button";
    element.className = `stage-object${object.id === selectedObjectId ? " selected" : ""}`;
    element.dataset.objectId = object.id;
    element.setAttribute("aria-label", `Move ${object.label || object.symbol}`);
    element.textContent = object.symbol;
    applyStageObjectStyle(element, object);
    wrapper.appendChild(element);
    element.addEventListener("pointerdown", event => {
      if (activeTool !== "select") return;
      event.preventDefault();
      event.stopPropagation();
      const objectLayer = currentProject.layers.find(item => item.id === object.layerId);
      if (objectLayer && selectedLayerId !== objectLayer.id) selectLayer(objectLayer.id);
      selectObject(object.id);
      element.setPointerCapture(event.pointerId);
    });
    element.addEventListener("pointermove", event => {
      if (!element.hasPointerCapture(event.pointerId)) return;
      const bounds = wrapper.getBoundingClientRect();
      object.x = Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100));
      object.y = Math.max(0, Math.min(100, (event.clientY - bounds.top) / bounds.height * 100));
      applyStageObjectStyle(element, object);
    });
    element.addEventListener("pointerup", () => saveCurrentFrame());
    element.addEventListener("pointercancel", () => saveCurrentFrame());
  });
}

function addStageObject(symbol, label = symbol) {
  if (!currentProject) return;
  let layer = currentProject.layers.find(item => item.id === selectedLayerId && item.type !== "puppet" && item.visible);
  if (!layer) layer = currentProject.layers.find(item => item.type !== "puppet" && item.visible);
  if (!layer) return;
  setActiveTool("select");
  if (selectedLayerId !== layer.id) selectLayer(layer.id);
  const object = {
    id: `object-${Date.now()}-${++createdObjectCount}`,
    symbol,
    label,
    layerId: layer.id,
    x: symbol === "💬" ? 72 : 50,
    y: symbol === "💬" ? 24 : 50,
    size: 100,
    rotation: 0
  };
  getCurrentFrameObjects().push(object);
  selectedObjectId = object.id;
  renderFrameObjects(getCurrentFrameObjects());
  updateObjectProperties();
  saveCurrentFrame();
}

$("#object-size").addEventListener("input", event => {
  const object = getSelectedObject();
  if (!object) return;
  object.size = Number(event.target.value);
  const element = $(`.stage-object[data-object-id="${object.id}"]`);
  if (element) applyStageObjectStyle(element, object);
  $("#object-size-value").value = `${object.size}%`;
  saveCurrentFrame();
});

$("#object-rotation").addEventListener("input", event => {
  const object = getSelectedObject();
  if (!object) return;
  object.rotation = Number(event.target.value);
  const element = $(`.stage-object[data-object-id="${object.id}"]`);
  if (element) applyStageObjectStyle(element, object);
  $("#object-rotation-value").value = `${object.rotation}°`;
  saveCurrentFrame();
});

$("#stage").addEventListener("pointerdown", event => {
  if (event.target === $("#stage-layers") || event.target === $("#stage")) selectObject(null);
});

function getActiveDrawingCanvas() {
  return layerCanvases.get(selectedLayerId) || layerCanvases.values().next().value || null;
}

function resizeCanvas(preserve = true) {
  layerCanvases.forEach(canvas => {
    const rect = $("#stage").getBoundingClientRect();
    const old = preserve && canvas.width ? canvas.toDataURL() : null;
    canvas.width = rect.width;
    canvas.height = rect.height;
    if (old) {
      const image = new Image();
      image.onload = () => canvas.getContext("2d").drawImage(image, 0, 0, rect.width, rect.height);
      image.src = old;
    }
  });
}

function attachDrawingEvents(canvas) {
  const context = canvas.getContext("2d");
  const getPoint = event => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * canvas.width / rect.width,
      y: (event.clientY - rect.top) * canvas.height / rect.height
    };
  };
  canvas.addEventListener("pointerdown", event => {
    if (!["pen", "brush", "eraser"].includes(activeTool) || selectedLayerId !== canvas.dataset.layerId) return;
    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    undoStack.push(canvas.toDataURL());
    redoStack = [];
    const point = getPoint(event);
    context.beginPath();
    context.moveTo(point.x, point.y);
  });
  canvas.addEventListener("pointermove", event => {
    if (!drawing || selectedLayerId !== canvas.dataset.layerId) return;
    const point = getPoint(event);
    context.lineTo(point.x, point.y);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = activeTool === "brush" ? 12 : activeTool === "eraser" ? 24 : 3;
    context.globalCompositeOperation = activeTool === "eraser" ? "destination-out" : "source-over";
    context.strokeStyle = $("#color-picker").value;
    context.stroke();
  });
  const finishDrawing = () => {
    if (!drawing) return;
    drawing = false;
    context.closePath();
    context.globalCompositeOperation = "source-over";
    saveCurrentFrame();
  };
  canvas.addEventListener("pointerup", finishDrawing);
  canvas.addEventListener("pointercancel", finishDrawing);
}

$("#undo-button").addEventListener("click", () => {
  if (!undoStack.length) return;
  const canvas = getActiveDrawingCanvas();
  if (!canvas) return;
  redoStack.push(canvas.toDataURL());
  restoreCanvas(canvas, undoStack.pop(), undefined, true);
});

$("#redo-button").addEventListener("click", () => {
  if (!redoStack.length) return;
  const canvas = getActiveDrawingCanvas();
  if (!canvas) return;
  undoStack.push(canvas.toDataURL());
  restoreCanvas(canvas, redoStack.pop(), undefined, true);
});

function restoreCanvas(canvas, source, restoreId, saveAfterRestore = false) {
  const context = canvas.getContext("2d");
  const activeRestoreId = restoreId ?? ++canvasRestoreId;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!source) {
    if (saveAfterRestore) saveCurrentFrame();
    return;
  }
  const image = new Image();
  image.onload = () => {
    if (activeRestoreId !== canvasRestoreId) return;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    if (saveAfterRestore) saveCurrentFrame();
  };
  image.src = source;
}

function restoreFrameDrawings(drawings = {}) {
  const restoreId = ++canvasRestoreId;
  layerCanvases.forEach((canvas, layerId) => {
    restoreCanvas(canvas, drawings[layerId] || null, restoreId);
  });
}

function attachPuppetInteractions(svg) {
  $$(".limb", svg).forEach(limb => {
    limb.addEventListener("pointerdown", event => {
      if (activeTool !== "select" || selectedLayerId !== "puppet") return;
      limb.setPointerCapture(event.pointerId);
    });
    limb.addEventListener("pointermove", event => {
      if (activeTool !== "select" || !limb.hasPointerCapture(event.pointerId)) return;
      const point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const { x, y } = point.matrixTransform(svg.getScreenCTM().inverse());
      const isArm = limb.dataset.limb.includes("arm");
      if (isArm) limb.setAttribute("d", `M190 155 L${Math.max(70, Math.min(310, x))} ${Math.max(120, Math.min(300, y))}`);
      else limb.setAttribute("d", `M190 260 L${Math.max(70, Math.min(310, x))} ${Math.max(280, Math.min(390, y))}`);
    });
    limb.addEventListener("pointerup", () => saveCurrentFrame());
    limb.addEventListener("pointercancel", () => saveCurrentFrame());
  });
}

$("#frame-strip").addEventListener("click", event => {
  const frameButton = event.target.closest("[data-frame-index]");
  if (frameButton) {
    selectFrame(Number(frameButton.dataset.frameIndex));
    return;
  }
  if (!event.target.closest("#add-frame") || !currentProject) return;
  saveCurrentFrame();
  const duplicate = JSON.parse(JSON.stringify(currentProject.frames[selectedFrameIndex]));
  currentProject.frames.push(duplicate);
  selectedFrameIndex = currentProject.frames.length - 1;
  persistProjects();
  renderFrames();
  loadFrame(selectedFrameIndex, false);
});

$("#previous-frame").addEventListener("click", () => selectFrame(selectedFrameIndex - 1));

$("#add-layer").addEventListener("click", () => {
  if (!currentProject) return;
  saveCurrentFrame();
  const layerId = `layer-${Date.now()}-${++createdLayerCount}`;
  const layer = { id: layerId, name: `Layer ${createdLayerCount}`, type: "drawing", visible: true, opacity: 100, size: 100 };
  currentProject.layers.unshift(layer);
  selectedLayerId = layerId;
  persistProjects();
  renderStageLayers();
  renderLayerList();
  requestAnimationFrame(() => {
    resizeCanvas(false);
    loadFrame(selectedFrameIndex, false);
  });
});

let playing = false;
function stopPlayback() {
  playing = false;
  if (playbackTimer) clearInterval(playbackTimer);
  playbackTimer = null;
  $("#play-animation").textContent = "▶";
}

$("#play-animation").addEventListener("click", () => {
  if (playing) {
    stopPlayback();
    return;
  }
  if (!currentProject || currentProject.frames.length < 2) return;
  playing = true;
  $("#play-animation").textContent = "❚❚";
  playbackTimer = setInterval(() => {
    selectFrame((selectedFrameIndex + 1) % currentProject.frames.length);
  }, 450);
});
$("#stop-animation").addEventListener("click", stopPlayback);

window.addEventListener("resize", () => {
  if (!editor.classList.contains("hidden")) resizeCanvas();
});

const audioPreferences = JSON.parse(localStorage.getItem("toonforge-audio") || '{"effects":true,"music":false}');
let soundEffectsEnabled = audioPreferences.effects !== false;
let musicEnabled = audioPreferences.music === true;
let audioContext = null;
let musicTimer = null;
let musicNoteIndex = 0;

function getAudioContext() {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) return null;
  if (!audioContext) audioContext = new AudioContextConstructor();
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

function playTone(frequency, duration = 0.12, volume = 0.025, waveform = "sine") {
  const audio = getAudioContext();
  if (!audio) return;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const start = audio.currentTime;
  oscillator.type = waveform;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration);
}

function playButtonSound(button) {
  const label = button.dataset.sound || button.id || button.getAttribute("aria-label") || button.textContent.trim();
  let hash = 0;
  for (const character of label) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  playTone(260 + hash % 420, 0.09, 0.02, hash % 2 ? "triangle" : "sine");
}

const musicNotes = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23];
function startMusic() {
  if (!musicEnabled || musicTimer) return;
  getAudioContext();
  musicTimer = setInterval(() => {
    playTone(musicNotes[musicNoteIndex % musicNotes.length], 0.34, 0.008, "sine");
    musicNoteIndex++;
  }, 420);
}

function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}

function saveAudioPreferences() {
  localStorage.setItem("toonforge-audio", JSON.stringify({
    effects: soundEffectsEnabled,
    music: musicEnabled
  }));
}

function updateAudioControls() {
  const effectsButton = $("#sound-effects-toggle");
  const musicButton = $("#music-toggle");
  effectsButton.textContent = soundEffectsEnabled ? "🔊 Sounds on" : "🔇 Sounds off";
  effectsButton.setAttribute("aria-pressed", String(soundEffectsEnabled));
  musicButton.textContent = musicEnabled ? "♫ Music on" : "♫ Music off";
  musicButton.setAttribute("aria-pressed", String(musicEnabled));
}

$("#sound-effects-toggle").addEventListener("click", () => {
  soundEffectsEnabled = !soundEffectsEnabled;
  saveAudioPreferences();
  updateAudioControls();
});

$("#music-toggle").addEventListener("click", () => {
  musicEnabled = !musicEnabled;
  saveAudioPreferences();
  updateAudioControls();
  if (musicEnabled) startMusic();
  else stopMusic();
});

document.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button || button.disabled) return;
  if (soundEffectsEnabled) playButtonSound(button);
  if (musicEnabled && !musicTimer) startMusic();
});

updateAudioControls();
const rememberedUser = localStorage.getItem("toonforge-user");
if (rememberedUser) setAuthenticated(rememberedUser);
