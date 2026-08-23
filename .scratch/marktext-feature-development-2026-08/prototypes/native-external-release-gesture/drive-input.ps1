param(
  [Parameter(Mandatory=$true)][ValidateSet('boundary-reenter','blur-reenter','timeout-external-release','escape-external-release','external-release')][string]$Scenario,
  [Parameter(Mandatory=$true)][int]$SourceX,
  [Parameter(Mandatory=$true)][int]$SourceY,
  [Parameter(Mandatory=$true)][int]$ExternalX,
  [Parameter(Mandatory=$true)][int]$ExternalY
)

$source = @'
using System;
using System.Runtime.InteropServices;
public static class InputDriver {
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public InputUnion U; }
  [StructLayout(LayoutKind.Explicit)] public struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr dwExtraInfo; }
  [DllImport("user32.dll", SetLastError=true)] public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int nIndex);
  const uint INPUT_MOUSE=0, INPUT_KEYBOARD=1, MOVE=1, LEFTDOWN=2, LEFTUP=4, ABSOLUTE=0x8000, VIRTUALDESK=0x4000, KEYUP=2;
  static INPUT Mouse(uint flags, int x, int y) { return new INPUT { type=INPUT_MOUSE, U=new InputUnion { mi=new MOUSEINPUT { dx=x, dy=y, dwFlags=flags } } }; }
  public static void Move(int x, int y) {
    int left=GetSystemMetrics(76), top=GetSystemMetrics(77), width=GetSystemMetrics(78), height=GetSystemMetrics(79);
    int ax=(int)Math.Round((x-left)*65535.0/(width-1)), ay=(int)Math.Round((y-top)*65535.0/(height-1));
    SendInput(1, new [] { Mouse(MOVE|ABSOLUTE|VIRTUALDESK, ax, ay) }, Marshal.SizeOf(typeof(INPUT)));
  }
  public static void Down() { SendInput(1, new [] { Mouse(LEFTDOWN, 0, 0) }, Marshal.SizeOf(typeof(INPUT))); }
  public static void Up() { SendInput(1, new [] { Mouse(LEFTUP, 0, 0) }, Marshal.SizeOf(typeof(INPUT))); }
  public static void Escape() {
    var down=new INPUT { type=INPUT_KEYBOARD, U=new InputUnion { ki=new KEYBDINPUT { wVk=0x1b } } };
    var up=down; up.U.ki.dwFlags=KEYUP;
    SendInput(2, new [] { down, up }, Marshal.SizeOf(typeof(INPUT)));
  }
}
'@

Add-Type -TypeDefinition $source
function Pause([int]$Milliseconds) { Start-Sleep -Milliseconds $Milliseconds }
function MoveToSource { [InputDriver]::Move($SourceX, $SourceY); Pause 120 }
function MoveToExternal { [InputDriver]::Move($ExternalX, $ExternalY); Pause 250 }

Write-Output ('{"type":"driver-start","scenario":"' + $Scenario + '"}')
MoveToSource
[InputDriver]::Down()
Pause 260
MoveToExternal
switch ($Scenario) {
  'boundary-reenter' { Pause 650; MoveToSource; Pause 150; [InputDriver]::Up() }
  'blur-reenter' { Pause 700; MoveToSource; Pause 150; [InputDriver]::Up() }
  'timeout-external-release' { Pause 900; [InputDriver]::Up() }
  'escape-external-release' { Pause 180; [InputDriver]::Escape(); Pause 320; [InputDriver]::Up() }
  'external-release' { Pause 160; [InputDriver]::Up() }
}
Pause 250
Write-Output ('{"type":"driver-finish","scenario":"' + $Scenario + '"}')
