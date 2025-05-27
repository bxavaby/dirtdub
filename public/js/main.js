let audioContext = null;
let audioBuffer = null;
let audioSourceNode = null;
let playbackTime = 0;
let playbackStartTime = 0;
let knobAngle = 0;
let isDragging = false;
let lastMouseAngle = 0;
let isUserPaused = false;
let degradationEngine = null;
let shouldLoop = false;
const SHORT_SAMPLE_THRESHOLD = 20; // seconds
let performanceMonitor = null;

const AppState = {
  IDLE: "idle",
  LOADING: "loading",
  PLAYING: "playing",
  PAUSED_BY_HOVER: "paused-by-hover",
};
let currentState = AppState.IDLE;

const logoButton = document.getElementById("logo-button");
const audioFileInput = document.getElementById("audio-file-input");
const knobContainer = document.getElementById("main-knob");
const knobInner = document.querySelector(".knob-inner");
const knobSticker = document.getElementById("knob-sticker");
const knobIndicator = document.querySelector(".knob-indicator");

function initAudio() {
  const AudioContextClass = window.AudioContext || window.AudioContext;
  if (!AudioContextClass) {
    showUserMessage(
      "Your browser doesn't support Web Audio API. Please use a modern browser.",
      "error",
    );
    return;
  }
  if (!audioContext) {
    try {
      audioContext = new AudioContextClass();
      if (audioContext.state === "suspended") {
        audioContext.resume();
      }

      if (window.PerformanceEntry) {
        performanceMonitor = new performanceMonitor();
        performanceMonitor.startMonitoring(audioContext);
      }
    } catch (error) {
      console.error("Failed to create audio context:", error);
      showUserMessage(
        "Failed to initialize audio. Please refresh and try again.",
        "error",
      );
    }
  }
}

function showUserMessage(message, type = "info") {
  let messageEl = document.getElementById("user-message");
  if (!messageEl) {
    messageEl = document.createElement("div");
    messageEl.id = "user-message";
    messageEl.className = "user-message";
    document.body.appendChild(messageEl);
  }

  messageEl.textContent = message;
  messageEl.className = `user-message ${type} show`;

  setTimeout(() => {
    messageEl.classList.remove("show");
  }, 5000);
}

async function createNewDegradationEngine() {
  if (degradationEngine) {
    degradationEngine.destroy();
    degradationEngine = null;
  }

  if (audioContext) {
    try {
      degradationEngine = new AudioDegradationEngine(audioContext);
      await degradationEngine.setupAudioChain();
      console.log("New degradation engine created and ready");

      updateDegradationLevel();
      return true;
    } catch (error) {
      console.error("Failed to create degradation engine:", error);
      return false;
    }
  }
  return false;
}

function updateState(newState) {
  console.log(`State: ${currentState} → ${newState}`);
  currentState = newState;
  logoButton.classList.remove("loading", "active", "paused");

  switch (newState) {
    case AppState.LOADING:
      logoButton.classList.add("loading");
      break;
    case AppState.PLAYING:
      logoButton.classList.add("active");
      break;
    case AppState.PAUSED_BY_HOVER:
      logoButton.classList.add("paused");
      break;
  }
}

async function loadAudioFile(file) {
  if (!audioContext || !file) return;

  try {
    updateState(AppState.LOADING);

    if (audioSourceNode) {
      audioSourceNode.onended = null;
      try {
        audioSourceNode.stop();
        audioSourceNode.disconnect();
      } catch (e) {}
      audioSourceNode = null;
    }

    const arrayBuffer = await file.arrayBuffer();
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    playbackTime = 0;
    isUserPaused = false;

    shouldLoop = audioBuffer.duration < SHORT_SAMPLE_THRESHOLD;
    if (shouldLoop) {
      console.log(
        `Short sample detected (${audioBuffer.duration.toFixed(2)}s) - enabling loop`,
      );
    }

    const engineReady = await createNewDegradationEngine();
    if (!engineReady) {
      console.warn(
        "Failed to create degradation engine, using direct connection",
      );
    }

    playAudio();
  } catch (error) {
    console.error("Error loading audio:", error);
    alert("Could not load audio file. Please try a different file.");
    updateState(AppState.IDLE);
  }
}

async function playAudio() {
  if (!audioBuffer || !audioContext) return;

  if (audioSourceNode) {
    audioSourceNode.onended = null;
    try {
      audioSourceNode.stop();
      audioSourceNode.disconnect();
    } catch (e) {}
  }

  audioSourceNode = audioContext.createBufferSource();
  audioSourceNode.buffer = audioBuffer;
  audioSourceNode.loop = shouldLoop;

  let outputNode;
  if (degradationEngine && degradationEngine.isReady) {
    outputNode = degradationEngine.connectSource(audioSourceNode);
  } else {
    outputNode = audioSourceNode;
    console.warn("Using direct connection - degradation engine not ready");
  }

  outputNode.connect(audioContext.destination);

  const startOffset = Math.max(0, playbackTime % audioBuffer.duration);
  audioSourceNode.start(0, startOffset);
  playbackStartTime = audioContext.currentTime - startOffset;
  updateState(AppState.PLAYING);

  if (!shouldLoop) {
    audioSourceNode.onended = () => {
      console.log("Audio ended. User paused:", isUserPaused);
      if (!isUserPaused) {
        playbackTime = 0;
        playbackStartTime = 0;
        updateState(AppState.IDLE);
        audioSourceNode = null;
      }
    };
  }
}

function pauseAudio() {
  if (currentState === AppState.PLAYING && audioSourceNode) {
    console.log("Pausing audio on hover");
    isUserPaused = true;
    playbackTime = audioContext.currentTime - playbackStartTime;

    audioSourceNode.onended = null;
    audioSourceNode.stop();
    audioSourceNode.disconnect();
    audioSourceNode = null;

    updateState(AppState.PAUSED_BY_HOVER);
  }
}

function resumeAudio() {
  if (currentState === AppState.PAUSED_BY_HOVER && audioBuffer) {
    console.log("Resuming audio after hover");
    isUserPaused = false;
    playAudio();
  }
}

function stopAndResetAudio() {
  console.log("Stopping and resetting audio");
  isUserPaused = false;

  if (audioSourceNode) {
    audioSourceNode.onended = null;
    try {
      audioSourceNode.stop();
      audioSourceNode.disconnect();
    } catch (e) {}
    audioSourceNode = null;
  }

  audioBuffer = null;
  playbackTime = 0;
  playbackStartTime = 0;
  shouldLoop = false;

  if (degradationEngine) {
    degradationEngine.destroy();
    degradationEngine = null;
  }

  updateState(AppState.IDLE);
}

function updateDegradationLevel() {
  const intensity = knobAngle / 270;

  if (degradationEngine && degradationEngine.isReady) {
    degradationEngine.setDegradationLevel(intensity);
  }
}

function updateKnobRotation() {
  const rotation = knobAngle;
  knobInner.style.transform = `rotate(${rotation}deg)`;
  knobIndicator.style.transform = `translateX(-50%) rotate(${rotation}deg) translateX(0%) rotate(-${rotation}deg)`;

  const intensity = knobAngle / 270;
  knobSticker.style.filter = `
    contrast(${1 + intensity * 0.5})
    saturate(${1 + intensity * 0.3})
    brightness(${1 - intensity * 0.2})
  `;

  updateDegradationLevel();
}

function getMouseAngle(event, element) {
  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const deltaX = event.clientX - centerX;
  const deltaY = event.clientY - centerY;
  return Math.atan2(deltaY, deltaX) * (180 / Math.PI);
}

logoButton.addEventListener("click", () => {
  if (!audioContext) initAudio();

  if (currentState !== AppState.IDLE) {
    stopAndResetAudio();
  } else {
    audioFileInput.click();
  }
});

audioFileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) loadAudioFile(file);
  e.target.value = null;
});

logoButton.addEventListener("mouseenter", () => {
  if (currentState === AppState.PLAYING) {
    pauseAudio();
  }
});

logoButton.addEventListener("mouseleave", () => {
  if (currentState === AppState.PAUSED_BY_HOVER) {
    resumeAudio();
  }
});

// knob interaction
knobInner.addEventListener("mousedown", (e) => {
  e.preventDefault();
  isDragging = true;
  lastMouseAngle = getMouseAngle(e, knobInner);
  document.body.style.cursor = "grabbing";
});

document.addEventListener("mousemove", (e) => {
  if (!isDragging) return;

  const currentMouseAngle = getMouseAngle(e, knobInner);
  let angleDiff = currentMouseAngle - lastMouseAngle;

  if (angleDiff > 180) angleDiff -= 360;
  if (angleDiff < -180) angleDiff += 360;

  knobAngle += angleDiff;
  knobAngle = Math.max(0, Math.min(knobAngle, 270));

  updateKnobRotation();
  lastMouseAngle = currentMouseAngle;
});

document.addEventListener("mouseup", () => {
  if (isDragging) {
    isDragging = false;
    document.body.style.cursor = "";
  }
});

knobInner.addEventListener("wheel", (e) => {
  e.preventDefault();
  knobAngle += e.deltaY * -0.1;
  knobAngle = Math.max(0, Math.min(knobAngle, 270));
  updateKnobRotation();
});

updateKnobRotation();

knobInner.addEventListener("contextmenu", (e) => e.preventDefault());

document.addEventListener("keydown", (e) => {
  switch (e.key.toLowerCase()) {
    case " ": // Spacebar - play/pause
      e.preventDefault();
      if (currentState === AppState.PLAYING) {
        pauseAudio();
      } else if (currentState === AppState.PAUSED_BY_HOVER) {
        resumeAudio();
      }
      break;

    case "r": // R - reset knob to 0
      knobAngle = 0;
      updateKnobRotation();
      break;

    case "d": // D - max degradation
      knobAngle = 270;
      updateKnobRotation();
      break;

    case "arrowleft": // Left arrow - decrease degradation
      e.preventDefault();
      knobAngle = Math.max(0, knobAngle - 10);
      updateKnobRotation();
      break;

    case "arrowright": // Right arrow - increase degradation
      e.preventDefault();
      knobAngle = Math.min(270, knobAngle + 10);
      updateKnobRotation();
      break;

    case "o": // O - open file
      if (currentState === AppState.IDLE) {
        audioFileInput.click();
      }
      break;
  }
});

// mobile knob control
let touchStartY = 0;

knobInner.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    touchStartY = e.touches[0].clientY;
    document.body.style.cursor = "grabbing";
  },
  { passive: false },
);

knobInner.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();
    const touchY = e.touches[0].clientY;
    const deltaY = touchStartY - touchY;

    knobAngle += deltaY * 0.5;
    knobAngle = Math.max(0, Math.min(knobAngle, 270));

    updateKnobRotation();
    touchStartY = touchY;
  },
  { passive: false },
);

knobInner.addEventListener("touchend", () => {
  document.body.style.cursor = "";
});

console.log("D!RTDUB initialized");
