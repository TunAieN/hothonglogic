import { loadExtensionSettings } from "./extension-src/storage/settings.js";

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
        const response = await fetch(settings.apiEndpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                query: `
                    mutation Login($email: String!, $password: String!) {
                        login(email: $email, password: $password) {
                            access_token
                            user {
                                id
                                name
                                email
                            }
                        }
                    }
                `,
                variables: { email, password },
            }),
        });
        const payload = await response.json();

        if (!response.ok || !payload.data?.login) {
            throw new Error(payload.errors?.[0]?.message || "Sai tài khoản hoặc mật khẩu.");
        }

        const { access_token: accessToken, user } = payload.data.login;
        await chrome.storage.local.set({ token: accessToken, user });
        showToast("Đăng nhập thành công!");

        setTimeout(() => window.close(), 800);
    } catch (error) {
        console.error("Extension login failed:", error);
        showToast(error instanceof Error ? error.message : "Không thể đăng nhập.", "error");
    }
});
