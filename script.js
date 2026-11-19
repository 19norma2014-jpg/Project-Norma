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
let playbackTimer = null;

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
    persistProjects();
  }
  selectedFrameIndex = 0;
  undoStack = [];
  redoStack = [];
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
        { icon: "●︵●", label: "Character" },
        { icon: "◕‿◕", label: "Happy character" },
        { icon: "💬", label: "Speech bubble" },
        { icon: "✦", label: "Sparkle" },
        { icon: "★", label: "Star" },
        { icon: "☁", label: "Cloud" }
      ]
    : [
        { icon: "😊", label: "Happy", expression: "happy" },
        { icon: "😮", label: "Surprised", expression: "surprised" },
        { icon: "😢", label: "Sad", expression: "sad" },
        { icon: "😠", label: "Angry", expression: "angry" }
      ];
  $("#preset-grid").innerHTML = presets.map((preset, index) =>
    `<button class="preset" type="button" title="${preset.label}" aria-label="${preset.label}" data-preset-index="${index}" data-expression="${preset.expression || ""}">${preset.icon}</button>`
  ).join("");
  $$(".preset", $("#preset-grid")).forEach((button, index) => {
    button.addEventListener("click", () => {
      if (type === "animation") {
        applyExpression(presets[index].expression);
        saveCurrentFrame();
      } else {
        addCanvasStamp(presets[index].icon);
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

const canvas = $("#drawing-canvas");
const context = canvas.getContext("2d");
let activeTool = "select";
let drawing = false;
let undoStack = [];
let redoStack = [];
let canvasRestoreId = 0;

const defaultPose = {
  "left-arm": "M190 155 L110 215",
  "right-arm": "M190 155 L270 215",
  "left-leg": "M190 260 L130 350",
  "right-leg": "M190 260 L250 350"
};

function setActiveTool(toolName) {
  activeTool = toolName;
  $$(".tool").forEach(tool => tool.classList.toggle("active", tool.dataset.tool === toolName));
  $("#stage").dataset.tool = toolName;
}

$$(".tool").forEach(tool => tool.addEventListener("click", () => setActiveTool(tool.dataset.tool)));

function defaultFrame() {
  return { pose: { ...defaultPose }, expression: "happy", drawing: null };
}

function captureFrame() {
  const pose = {};
  $$(".limb").forEach(limb => { pose[limb.dataset.limb] = limb.getAttribute("d"); });
  return {
    pose,
    expression: $("#puppet").dataset.expression || "happy",
    drawing: canvas.width ? canvas.toDataURL() : null
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
  undoStack = [];
  redoStack = [];
  const frame = currentProject.frames[index];
  applyPose(frame.pose);
  applyExpression(frame.expression);
  restoreCanvas(frame.drawing);
  renderFrames();
}

function selectFrame(index) {
  if (!currentProject || index < 0 || index >= currentProject.frames.length) return;
  loadFrame(index);
}

function addCanvasStamp(symbol) {
  if (!canvas.width || !canvas.height) return;
  undoStack.push(canvas.toDataURL());
  redoStack = [];
  context.save();
  context.globalCompositeOperation = "source-over";
  context.font = "42px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(symbol, canvas.width / 2, canvas.height / 2);
  context.restore();
  saveCurrentFrame();
}

function resizeCanvas(preserve = true) {
  const rect = canvas.parentElement.getBoundingClientRect();
  const old = preserve && canvas.width ? canvas.toDataURL() : null;
  canvas.width = rect.width;
  canvas.height = rect.height;
  if (old) {
    const image = new Image();
    image.onload = () => context.drawImage(image, 0, 0, rect.width, rect.height);
    image.src = old;
  }
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

canvas.addEventListener("pointerdown", event => {
  if (!["pen", "brush", "eraser"].includes(activeTool)) return;
  drawing = true;
  canvas.setPointerCapture(event.pointerId);
  undoStack.push(canvas.toDataURL());
  redoStack = [];
  const point = canvasPoint(event);
  context.beginPath();
  context.moveTo(point.x, point.y);
});

canvas.addEventListener("pointermove", event => {
  if (!drawing) return;
  const point = canvasPoint(event);
  context.lineTo(point.x, point.y);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = activeTool === "brush" ? 12 : activeTool === "eraser" ? 24 : 3;
  context.globalCompositeOperation = activeTool === "eraser" ? "destination-out" : "source-over";
  context.strokeStyle = $("#color-picker").value;
  context.stroke();
});

canvas.addEventListener("pointerup", () => {
  drawing = false;
  context.closePath();
  context.globalCompositeOperation = "source-over";
  saveCurrentFrame();
});
canvas.addEventListener("pointercancel", () => {
  drawing = false;
  context.closePath();
  context.globalCompositeOperation = "source-over";
  saveCurrentFrame();
});

$("#undo-button").addEventListener("click", () => {
  if (!undoStack.length) return;
  redoStack.push(canvas.toDataURL());
  restoreCanvas(undoStack.pop(), true);
});

$("#redo-button").addEventListener("click", () => {
  if (!redoStack.length) return;
  undoStack.push(canvas.toDataURL());
  restoreCanvas(redoStack.pop(), true);
});

function restoreCanvas(source, saveAfterRestore = false) {
  const restoreId = ++canvasRestoreId;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!source) {
    if (saveAfterRestore) saveCurrentFrame();
    return;
  }
  const image = new Image();
  image.onload = () => {
    if (restoreId !== canvasRestoreId) return;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    if (saveAfterRestore) saveCurrentFrame();
  };
  image.src = source;
}

$$(".limb").forEach(limb => {
  limb.addEventListener("pointerdown", event => {
    if (activeTool !== "select") return;
    limb.setPointerCapture(event.pointerId);
  });
  limb.addEventListener("pointermove", event => {
    if (activeTool !== "select" || !limb.hasPointerCapture(event.pointerId)) return;
    const svg = $("#puppet");
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

$("#layer-list").addEventListener("click", event => {
  const layer = event.target.closest(".layer");
  if (!layer) return;
  $$(".layer").forEach(item => item.classList.remove("active"));
  layer.classList.add("active");
});

$("#add-layer").addEventListener("click", () => {
  const layer = document.createElement("button");
  layer.className = "layer";
  layer.innerHTML = '<span class="layer-thumb">◇</span><span>New layer</span><b>◉</b>';
  $("#layer-list").appendChild(layer);
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

const rememberedUser = localStorage.getItem("toonforge-user");
if (rememberedUser) setAuthenticated(rememberedUser);
