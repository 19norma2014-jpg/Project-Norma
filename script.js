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
  event.preventEvent?.();
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
  const project = { id: Date.now(), name, type };
  projects.unshift(project);
  localStorage.setItem("toonforge-projects", JSON.stringify(projects));
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
    const gallery = button.dataset.view !== "projects";
    $(".projects-view").classList.toggle("hidden", gallery);
    $("#empty-gallery").classList.toggle("hidden", !gallery);
  });
});

const editor = $("#editor");
let currentProject = null;
function openEditor(project) {
  currentProject = project;
  dashboard.classList.add("hidden");
  editor.classList.remove("hidden");
  $("#project-name").value = project.name;
  $("#editor-project-icon").textContent = project.type === "comic" ? "▤" : "▶";
  $("#asset-title").textContent = project.type === "comic" ? "Characters & props" : "Puppet presets";
  renderPresets(project.type);
  requestAnimationFrame(resizeCanvas);
}

function renderPresets(type) {
  const presets = type === "comic"
    ? ["●︵●", "◕‿◕", "💬", "✦", "★", "☁"]
    : ["🧍", "🧍‍♀️", "😊", "😮", "★", "⚡"];
  $("#preset-grid").innerHTML = presets.map(preset => `<button class="preset" title="Add preset">${preset}</button>`).join("");
}

$("#back-to-dashboard").addEventListener("click", () => {
  editor.classList.add("hidden");
  dashboard.classList.remove("hidden");
  renderProjects();
});

$("#save-project").addEventListener("click", () => {
  if (!currentProject) return;
  currentProject.name = $("#project-name").value.trim() || "Untitled project";
  const index = projects.findIndex(project => project.id === currentProject.id);
  if (index >= 0) projects[index] = currentProject;
  localStorage.setItem("toonforge-projects", JSON.stringify(projects));
  $("#saved-status").textContent = "Saved just now";
  setTimeout(() => $("#saved-status").textContent = "Saved", 1800);
});

$("#project-name").addEventListener("input", () => $("#saved-status").textContent = "Unsaved");

$$(".tool").forEach(tool => {
  tool.addEventListener("click", () => {
    $$(".tool").forEach(item => item.classList.remove("active"));
    tool.classList.add("active");
    activeTool = tool.dataset.tool;
  });
});

const canvas = $("#drawing-canvas");
const context = canvas.getContext("2d");
let activeTool = "select";
let drawing = false;
let undoStack = [];
let redoStack = [];

function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const old = canvas.width ? canvas.toDataURL() : null;
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
});

$("#undo-button").addEventListener("click", () => {
  if (!undoStack.length) return;
  redoStack.push(canvas.toDataURL());
  restoreCanvas(undoStack.pop());
});

$("#redo-button").addEventListener("click", () => {
  if (!redoStack.length) return;
  undoStack.push(canvas.toDataURL());
  restoreCanvas(redoStack.pop());
});

function restoreCanvas(source) {
  context.clearRect(0, 0, canvas.width, canvas.height);
  const image = new Image();
  image.onload = () => context.drawImage(image, 0, 0);
  image.src = source;
}

$("#eraser-button");

$$(".limb").forEach(limb => {
  limb.addEventListener("pointerdown", event => {
    limb.setPointerCapture(event.pointerId);
  });
  limb.addEventListener("pointermove", event => {
    if (!limb.hasPointerCapture(event.pointerId)) return;
    const svg = $("#puppet");
    const rect = svg.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * 380;
    const y = (event.clientY - rect.top) / rect.height * 440;
    const isArm = limb.dataset.limb.includes("arm");
    const isLeft = limb.dataset.limb.includes("left");
    if (isArm) limb.setAttribute("d", `M190 155 L${Math.max(70, Math.min(310, x))} ${Math.max(120, Math.min(300, y))}`);
    else limb.setAttribute("d", `M190 260 L${Math.max(70, Math.min(310, x))} ${Math.max(280, Math.min(390, y))}`);
  });
});

$("#add-frame").addEventListener("click", () => {
  const frame = document.createElement("button");
  frame.className = "frame";
  frame.innerHTML = "<span>Frame</span><i></i>";
  $("#frame-strip").insertBefore(frame, $("#add-frame"));
  $$(".frame").forEach(item => item.classList.remove("active"));
  frame.classList.add("active");
});

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
$("#play-animation").addEventListener("click", () => {
  playing = !playing;
  $("#play-animation").textContent = playing ? "❚❚" : "▶";
});

window.addEventListener("resize", () => {
  if (!editor.classList.contains("hidden")) resizeCanvas();
});

const rememberedUser = localStorage.getItem("toonforge-user");
if (rememberedUser) setAuthenticated(rememberedUser);
