; 安装时清理旧品牌（知邮 ZhiMail）残留的快捷方式，避免开始菜单 / 桌面出现两个图标
; 注意：这里只删旧品牌，不要删当前品牌（智邮）的快捷方式。
!macro customInstall
  Delete "$DESKTOP\知邮 ZhiMail.lnk"
  Delete "$SMPROGRAMS\知邮 ZhiMail.lnk"
  Delete "$SMPROGRAMS\知邮 ZhiMail\知邮 ZhiMail.lnk"
  RMDir "$SMPROGRAMS\知邮 ZhiMail"
  Delete "$DESKTOP\ZhiMail.lnk"
  Delete "$SMPROGRAMS\ZhiMail.lnk"

  ; 桌面快捷方式兜底：升级（keepShortcuts）时 electron-builder 认为旧快捷方式还在，
  ; 而旧版卸载器已经把它删了，结果就是「更新一次，桌面图标就消失一次」。
  ; 这里在安装收尾时补一次，只在缺失时创建，不覆盖用户自己改过的图标/名称。
  ${ifNot} ${FileExists} "$DESKTOP\${SHORTCUT_NAME}.lnk"
    CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$DESKTOP\${SHORTCUT_NAME}.lnk" "${APP_ID}"
  ${endIf}

  ; 开始菜单快捷方式同理兜底
  !ifdef MENU_FILENAME
    ${ifNot} ${FileExists} "$SMPROGRAMS\${MENU_FILENAME}\${SHORTCUT_NAME}.lnk"
      CreateDirectory "$SMPROGRAMS\${MENU_FILENAME}"
      CreateShortCut "$SMPROGRAMS\${MENU_FILENAME}\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 "" "" "${APP_DESCRIPTION}"
      WinShell::SetLnkAUMI "$SMPROGRAMS\${MENU_FILENAME}\${SHORTCUT_NAME}.lnk" "${APP_ID}"
    ${endIf}
  !else
    ${ifNot} ${FileExists} "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
      CreateShortCut "$SMPROGRAMS\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 "" "" "${APP_DESCRIPTION}"
      WinShell::SetLnkAUMI "$SMPROGRAMS\${SHORTCUT_NAME}.lnk" "${APP_ID}"
    ${endIf}
  !endif

  ; 通知资源管理器刷新图标，避免装完还要手动刷新桌面
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend

; 完成页：把「运行 智邮」换成非阻塞启动。
; 默认实现用 StdUtils::ExecShellAsUser，它会一直等到新进程真正创建出来；
; 安装目录里刚解压出 190MB 的 exe，杀毒软件首次扫描期间完成页就像卡住了。
; 这里改用 Exec：点「完成」后向导立刻关闭，应用在后台自己启动。
!macro customFinishPage
  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    Exec '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" $1'
  FunctionEnd

  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !insertmacro MUI_PAGE_FINISH
!macroend

; 卸载时才删快捷方式。
; 千万不要在这里删当前品牌的桌面快捷方式：升级流程会先静默运行旧版卸载器，
; 删掉之后新版安装器的 keepShortcuts 分支会跳过重建，桌面图标就没了。
; electron-builder 自带的卸载逻辑本来就会删它自己创建的快捷方式。
!macro customUnInstall
  Delete "$DESKTOP\知邮 ZhiMail.lnk"
  Delete "$SMPROGRAMS\知邮 ZhiMail.lnk"
  RMDir "$SMPROGRAMS\知邮 ZhiMail"
  Delete "$DESKTOP\ZhiMail.lnk"
  Delete "$SMPROGRAMS\ZhiMail.lnk"
!macroend
