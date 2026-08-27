import { loadExtensionSettings } from "../storage/settings.js";
import { login } from "../api/authentication.js";
import { saveAuthSession } from "../auth/auth.js";

const showToast = (message, type = "success") => {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.style.background = type === "error" ? "#dc3545" : "#28a745";
    toast.style.display = "block";

    setTimeout(() => {
        toast.style.display = "none";
    }, 2000);
};

document.getElementById("loginSubmit").addEventListener("click", async () => {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (!email || !password) {
        showToast("Vui lòng nhập email và mật khẩu.", "error");
        return;
    }

    try {
        const settings = await loadExtensionSettings();
        const { access_token: accessToken, user } = await login({
            endpoint: settings.apiEndpoint,
            email,
            password,
        });
        await saveAuthSession(accessToken, user);
        showToast("Đăng nhập thành công!");

        setTimeout(() => window.close(), 800);
    } catch (error) {
        console.error("Extension login failed:", error);
        showToast(error instanceof Error ? error.message : "Không thể đăng nhập.", "error");
    }
});
