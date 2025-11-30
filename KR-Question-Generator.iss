; -- Inno Setup script for KR-Question-Generator --
#define MyAppName "KR-Question-Generator"
#define MyAppExeName "KR-Question-Generator.exe"
#define MyAppVersion "1.0"

[Setup]
AppName={#MyAppName}
AppVersion={#MyAppVersion}
DefaultDirName={pf}\{#MyAppName}
DefaultGroupName={#MyAppName}
OutputDir=dist
OutputBaseFilename=KR-Question-Generator-Installer
Compression=lzma
SolidCompression=yes

[Files]
Source: "dist\KR-Question-Generator.exe"; DestDir: "{app}"; Flags: ignoreversion
; Include requirements.txt for reference
Source: "server\requirements.txt"; DestDir: "{app}"; Flags: ignoreversion

; Optionally include other project files as needed
; Source: "server\*"; DestDir: "{app}\server"; Flags: ignoreversion recursesubdirs createallsubdirs

[Run]
Filename: "{app}\KR-Question-Generator.exe"; Description: "Run KR-Question-Generator"; Flags: nowait postinstall skipifsilent

[Code]
function IsPythonInstalled(): Boolean;
begin
  Result := RegKeyExists(HKLM, 'SOFTWARE\Python\PythonCore');
end;

procedure InstallPythonIfNeeded();
begin
  if not IsPythonInstalled() then
  begin
    MsgBox('Python is not installed. The installer will download and install Python 3.13.', mbInformation, MB_OK);
    ShellExec('', 'https://www.python.org/ftp/python/3.13.0/python-3.13.0-amd64.exe', '', '', SW_SHOWNORMAL, ewWaitUntilTerminated, ResultCode);
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
  begin
    InstallPythonIfNeeded();
    // Install Python libraries using pip
    if IsPythonInstalled() then
    begin
      ShellExec('', 'cmd.exe', '/C pip install fastapi==0.110.0 uvicorn==0.30.0 python-docx==0.8.11 openpyxl==3.1.2 python-multipart==0.0.9 html2docx==1.6.0 requests==2.32.3 Pillow==10.4.0 pytesseract==0.3.10', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    end;
  end;
end;