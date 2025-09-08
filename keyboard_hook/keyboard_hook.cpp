#include <windows.h>
#include <node_api.h>
#include <thread>
#include <iostream>
#include <atomic>
#include <string>

static HHOOK g_hook = NULL;
static std::atomic<bool> g_hookRunning(false);
static DWORD g_threadId = 0;

LRESULT CALLBACK KeyboardHookProc(int nCode, WPARAM wParam, LPARAM lParam) {
    if (nCode == HC_ACTION) {
        KBDLLHOOKSTRUCT* pKeyInfo = (KBDLLHOOKSTRUCT*)lParam;
        DWORD vkCode = pKeyInfo->vkCode;
        
        bool shouldBlock = false;
        
        if (vkCode == VK_LWIN || vkCode == VK_RWIN) {
            shouldBlock = true;
        } 
        else if ((GetAsyncKeyState(VK_LWIN) & 0x8000) || (GetAsyncKeyState(VK_RWIN) & 0x8000)) {
            switch(vkCode) {
                case VK_TAB:
                case 'D':
                case 'R':
                case 'L':
                case 'E':
                    shouldBlock = true;
                    break;
            }
        } 
        else if ((GetAsyncKeyState(VK_MENU) & 0x8000)) {
            switch(vkCode) {
                case VK_TAB:
                case VK_F4:
                    shouldBlock = true;
                    break;
            }
        } 
        else if ((GetAsyncKeyState(VK_CONTROL) & 0x8000) && vkCode == VK_ESCAPE) {
            shouldBlock = true;
        }
        
        if (shouldBlock) {
            return 1;
        }
    }
    return CallNextHookEx(g_hook, nCode, wParam, lParam);
}

void MessageLoop() {
    g_threadId = GetCurrentThreadId();
    MSG msg;
    while (g_hookRunning && GetMessage(&msg, NULL, 0, 0) > 0) {
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
        std::string errorMessage = "Failed to install hook: " + std::to_string(error);
        napi_throw_error(env, NULL, errorMessage.c_str());
    }
    return NULL;
}

napi_value StopHook(napi_env env, napi_callback_info args) {
    if (g_hook) {
        g_hookRunning = false;
        if (g_threadId != 0) {
            PostThreadMessage(g_threadId, WM_NULL, 0, 0);
        }
        UnhookWindowsHookEx(g_hook);
        g_hook = NULL;
        g_threadId = 0;
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
