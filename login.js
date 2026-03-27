document.getElementById("loginSubmit").addEventListener("click", async () => {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const res = await fetch("http://localhost:8000/graphql", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
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
            variables: { email, password }
        })
    });

    const json = await res.json();

    if (json.data?.login) {
        const { access_token, user } = json.data.login;

        // lưu token
        chrome.storage.local.set({
            token: access_token,
            user: user
        });

        showToast("Đăng nhập thành công!");

        setTimeout(() => {
            window.close();
        }, 2500);
    } else {
        showToast("Sai tài khoản hoặc mật khẩu!");
    }
});

function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.style.display = "block";

    setTimeout(() => {
        toast.style.display = "none";
    }, 2000);
}


