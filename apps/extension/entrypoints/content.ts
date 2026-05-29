export default defineContentScript({
  matches: ["*://*/*"],
  main() {
    if (document.readyState === "complete") {
      extractAndSend();
    } else {
      window.addEventListener("load", extractAndSend);
    }
  },
});

function extractAndSend() {
  const text = document.body?.innerText ?? "";
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length < 30) return;

  browser.runtime.sendMessage({
    type: "pwm:page-content",
    url: window.location.href,
    content: trimmed,
  });
}
