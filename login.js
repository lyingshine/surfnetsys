const loginForm = document.getElementById('login-form');
const errorMessage = document.getElementById('error-message');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = loginForm.username.value;
  const password = loginForm.password.value;

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
        // Redirect to the page specified by the server
        window.electronAPI.send('login-success', { page: data.page, username: data.username });
      } else {
        errorMessage.textContent = data.message;
      }
    } else {
      errorMessage.textContent = data.message || 'Login failed!';
    }
  } catch (error) {
    console.error('Login error:', error);
    errorMessage.textContent = 'An error occurred during login.';
  }
});
