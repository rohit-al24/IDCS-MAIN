; Inno Setup script for full project with backend server
#define MyAppName "KR-Question-Generator"
#define MyAppExeName "KR-Question-Generator.exe"
#define MyAppVersion "1.0"

[Setup]
AppName=KR-Question-Generator
AppVersion=1.0
DefaultDirName={pf}\KR-Question-Generator
DefaultGroupName=KR-Question-Generator
OutputDir=dist
OutputBaseFilename=KR-Question-Generator-Installer
Compression=lzma
SolidCompression=yes

[Files]
Source: "dist\KR-Question-Generator-Server.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Run Backend Server (port 4001)"; Filename: "{app}\KR-Question-Generator-Server.exe"; WorkingDir: "{app}"

[Run]
Filename: "{app}\KR-Question-Generator-Server.exe"; Description: "Run Backend Server (port 4001)"; Flags: nowait postinstall skipifsilent
