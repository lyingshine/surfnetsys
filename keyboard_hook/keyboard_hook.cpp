#include <windows.h>
#include <node_api.h>
#include <thread>
#include <iostream>
#include <atomic>

static HHOOK g_hook = NULL;
static std::atomic<bool> g_hookRunning(false);

LRESULT CALLBACK KeyboardHookProc(int nCode, WPARAM wParam, LPARAM lParam) {
    if (nCode == HC_ACTION) {
        KBDLLHOOKSTRUCT* pKeyInfo = (KBDLLHOOKSTRUCT*)lParam;
        DWORD vkCode = pKeyInfo->vkCode;
        
        bool shouldBlock = false;
        
        // 阻止Windows键
        if (vkCode == VK_LWIN || vkCode == VK_RWIN) {
            shouldBlock = true;
        } 
        // 阻止Windows组合键
        else if ((GetAsyncKeyState(VK_LWIN) & 0x8000) || (GetAsyncKeyState(VK_RWIN) & 0x8000)) {
            switch(vkCode) {
                case VK_TAB:    // Win+Tab
                case 'D':       // Win+D
                case 'R':       // Win+R
                case 'L':       // Win+L
                case 'E':       // Win+E
                    shouldBlock = true;
                    break;
            }
        } 
        // 阻止Alt组合键
        else if ((GetAsyncKeyState(VK_MENU) & 0x8000)) {
            switch(vkCode) {
                case VK_TAB:    // Alt+Tab
                case VK_F4:     // Alt+F4
                    shouldBlock = true;
                    break;
            }
        } 
        // 阻止Ctrl组合键
        else if ((GetAsyncKeyState(VK_CONTROL) & 0x8000) && vkCode == VK_ESCAPE) {
            shouldBlock = true; // Ctrl+Esc
        }
        
        if (shouldBlock) {
            return 1; // 阻止按键
        }
    }
    return CallNextHookEx(g_hook, nCode, wParam, lParam);
}

void MessageLoop() {
    MSG msg;
    while (g_hookRunning && GetMessage(&msg, NULL, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }
}

napi_value StartHook(napi_env env, napi_callback_info args) {
    if (g_hook != NULL) {
        napi_throw_error(env, NULL, "Hook is already running");
        return NULL;
    }
    
    g_hook = SetWindowsHookEx(WH_KEYBOARD_LL, KeyboardHookProc, GetModuleHandle(NULL), 0);
    if (g_hook) {
        g_hookRunning = true;
        std::thread(MessageLoop).detach();
    } else {
        DWORD error = GetLastError();
        napi_throw_error(env, NULL, ("Failed to install hook: " + std::to_string(error)).c_str());
    }
    return NULL;
}

napi_value StopHook(napi_env env, napi_callback_info args) {
    if (g_hook) {
        g_hookRunning = false;
        UnhookWindowsHookEx(g_hook);
        g_hook = NULL;
        
        // 发送一个空消息来唤醒消息循环
        PostThreadMessage(GetCurrentThreadId(), WM_NULL, 0, 0);
    }
    return NULL;
}

napi_value Init(napi_env env, napi_value exports) {
    napi_value start_fn, stop_fn;
    
    napi_status status;
    
    status = napi_create_function(env, NULL, 0, StartHook, NULL, &start_fn);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Failed to create startHook function");
        return NULL;
    }
    
    status = napi_set_named_property(env, exports, "startHook", start_fn);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Failed to set startHook property");
        return NULL;
    }
    
    status = napi_create_function(env, NULL, 0, StopHook, NULL, &stop_fn);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Failed to create stopHook function");
        return NULL;
    }
    
    status = napi_set_named_property(env, exports, "stopHook", stop_fn);
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Failed to set stopHook property");
        return NULL;
    }
    
    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)