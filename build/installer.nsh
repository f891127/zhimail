; 安装时清理旧品牌（知邮 ZhiMail）残留的快捷方式，避免开始菜单 / 桌面出现两个图标
!macro customInstall
  Delete "$DESKTOP\知邮 ZhiMail.lnk"
  Delete "$SMPROGRAMS\知邮 ZhiMail.lnk"
  Delete "$SMPROGRAMS\知邮 ZhiMail\知邮 ZhiMail.lnk"
  RMDir "$SMPROGRAMS\知邮 ZhiMail"
  Delete "$DESKTOP\ZhiMail.lnk"
  Delete "$SMPROGRAMS\ZhiMail.lnk"
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

!macro customUnInstall
  Delete "$DESKTOP\智邮.lnk"
  Delete "$SMPROGRAMS\智邮.lnk"
  Delete "$DESKTOP\ZhiYou.lnk"
  Delete "$SMPROGRAMS\ZhiYou.lnk"
!macroend
