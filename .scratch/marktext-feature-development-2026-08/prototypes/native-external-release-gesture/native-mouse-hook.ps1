param(
  [int]$Milliseconds = 30000
)

$ErrorActionPreference = 'Stop'

$source = @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

public static class NativeInputHook {
  private const int WH_KEYBOARD_LL = 13;
  private const int WH_MOUSE_LL = 14;
  private const int WM_MOUSEMOVE = 0x0200;
  private const int WM_LBUTTONDOWN = 0x0201;
  private const int WM_LBUTTONUP = 0x0202;
  private const int WM_KEYDOWN = 0x0100;
  private const int WM_SYSKEYDOWN = 0x0104;
  private const int VK_ESCAPE = 0x1B;
  private delegate IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam);
  private static readonly HookProc mouseCallback = MouseHookCallback;
  private static readonly HookProc keyboardCallback = KeyboardHookCallback;
  private static IntPtr mouseHook = IntPtr.Zero;
  private static IntPtr keyboardHook = IntPtr.Zero;

  [StructLayout(LayoutKind.Sequential)] private struct POINT { public int x; public int y; }
  [StructLayout(LayoutKind.Sequential)] private struct MSLLHOOKSTRUCT {
    public POINT pt; public uint mouseData; public uint flags; public uint time; public IntPtr dwExtraInfo;
  }
  [StructLayout(LayoutKind.Sequential)] private struct KBDLLHOOKSTRUCT {
    public uint vkCode; public uint scanCode; public uint flags; public uint time; public IntPtr dwExtraInfo;
  }
  [DllImport("user32.dll", SetLastError=true)] private static extern IntPtr SetWindowsHookEx(int idHook, HookProc callback, IntPtr module, uint threadId);
  [DllImport("user32.dll", SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool UnhookWindowsHookEx(IntPtr hook);
  [DllImport("user32.dll")] private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr wParam, IntPtr lParam);
  [DllImport("kernel32.dll", CharSet=CharSet.Auto, SetLastError=true)] private static extern IntPtr GetModuleHandle(string moduleName);

  public static void Run(int milliseconds) {
    IntPtr module;
    using (Process process = Process.GetCurrentProcess()) using (ProcessModule current = process.MainModule) {
      module = GetModuleHandle(current.ModuleName);
    }
    mouseHook = SetWindowsHookEx(WH_MOUSE_LL, mouseCallback, module, 0);
    keyboardHook = SetWindowsHookEx(WH_KEYBOARD_LL, keyboardCallback, module, 0);
    if (mouseHook == IntPtr.Zero || keyboardHook == IntPtr.Zero) {
      if (mouseHook != IntPtr.Zero) UnhookWindowsHookEx(mouseHook);
      if (keyboardHook != IntPtr.Zero) UnhookWindowsHookEx(keyboardHook);
      throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    }
    Console.WriteLine("{\"type\":\"native-ready\",\"mouseSource\":\"WH_MOUSE_LL\",\"keyboardSource\":\"WH_KEYBOARD_LL\"}");
    var context = new ApplicationContext();
    new System.Threading.Timer(_ => context.ExitThread(), null, milliseconds, Timeout.Infinite);
    Application.Run(context);
    UnhookWindowsHookEx(mouseHook);
    UnhookWindowsHookEx(keyboardHook);
  }

  private static IntPtr MouseHookCallback(int code, IntPtr message, IntPtr data) {
    if (code >= 0) {
      int value = message.ToInt32();
      if (value == WM_MOUSEMOVE || value == WM_LBUTTONDOWN || value == WM_LBUTTONUP) {
        var input = Marshal.PtrToStructure<MSLLHOOKSTRUCT>(data);
        string type = value == WM_MOUSEMOVE ? "move" : (value == WM_LBUTTONDOWN ? "down" : "up");
        string name = value == WM_MOUSEMOVE ? "WM_MOUSEMOVE" : (value == WM_LBUTTONDOWN ? "WM_LBUTTONDOWN" : "WM_LBUTTONUP");
        Console.WriteLine("{\"type\":\"native-" + type + "\",\"x\":" + input.pt.x + ",\"y\":" + input.pt.y + ",\"message\":\"" + name + "\",\"flags\":" + input.flags + ",\"injected\":" + ((input.flags & 1) != 0 ? "true" : "false") + ",\"source\":\"WH_MOUSE_LL\"}");
      }
    }
    return CallNextHookEx(mouseHook, code, message, data);
  }

  private static IntPtr KeyboardHookCallback(int code, IntPtr message, IntPtr data) {
    if (code >= 0 && (message.ToInt32() == WM_KEYDOWN || message.ToInt32() == WM_SYSKEYDOWN)) {
      var input = Marshal.PtrToStructure<KBDLLHOOKSTRUCT>(data);
      if (input.vkCode == VK_ESCAPE) Console.WriteLine("{\"type\":\"native-escape\",\"message\":\"WM_KEYDOWN\",\"flags\":" + input.flags + ",\"injected\":" + ((input.flags & 0x10) != 0 ? "true" : "false") + ",\"source\":\"WH_KEYBOARD_LL\"}");
    }
    return CallNextHookEx(keyboardHook, code, message, data);
  }
}
'@

Add-Type -TypeDefinition $source -ReferencedAssemblies System.Windows.Forms
[NativeInputHook]::Run($Milliseconds)
