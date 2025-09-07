const loginForm = document.getElementById('login-form');
const errorMessage = document.getElementById('error-message');

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = loginForm.username.value.trim();
    const password = loginForm.password.value;

    // 输入验证
    if (!username || !password) {
        errorMessage.textContent = '用户名和密码不能为空';
        return;
    }

    // 防止XSS攻击
    if (username.length > 50 || password.length > 100) {
        errorMessage.textContent = '输入长度超过限制';
        return;
    }

    // 防止SQL注入和特殊字符攻击
    const usernameRegex = /^[a-zA-Z0-9_\-@.]+$/;
    if (!usernameRegex.test(username)) {
        errorMessage.textContent = '用户名包含非法字符';
        return;
    }

    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password }),
        });

        const data = await response.json();

        if (response.ok) {
            if (data.success) {
                window.electronAPI.send('login-success', { 
                    page: data.page, 
                    username: data.username 
                });
            } else {
                errorMessage.textContent = data.message || '登录失败';
            }
        } else {
            errorMessage.textContent = data.message || '登录失败';
        }
    } catch (error) {
        console.error('Login error:', error);
        errorMessage.textContent = '登录过程中发生错误，请检查网络连接';
    }
});
