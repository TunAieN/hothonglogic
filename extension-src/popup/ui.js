export function setupTabs() {
  const tabs = document.querySelectorAll(".tab");
  const contents = document.querySelectorAll(".tab-content");
  tabs.forEach((tab) => tab.addEventListener("click", () => {
    tabs.forEach((item) => item.classList.remove("active"));
    contents.forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`${tab.dataset.tab}Tab`)?.classList.add("active");
  }));
}

export function showStatus(message, type = "info") {
  const status = document.getElementById("statusMessage");
  status.textContent = message;
  status.className = `status-message ${type}`;
  status.style.display = "block";
  setTimeout(() => { status.style.display = "none"; }, 3000);
}

export async function closeSidePanel() {
  if (!chrome.sidePanel?.close) {
    console.warn("Side Panel close API is unavailable in this Chrome version.");
    return false;
  }

  try {
    const currentWindow = await chrome.windows.getCurrent();
    if (currentWindow?.id == null) {
      console.warn("Unable to close side panel: current window has no id.");
      return false;
    }

    await chrome.sidePanel.close({ windowId: currentWindow.id });
    return true;
  } catch (error) {
    console.warn("Unable to close side panel via API:", error);
    return false;
  }
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
