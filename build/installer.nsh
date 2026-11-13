; 安装时清理旧版本可能残留的快捷方式，避免任务栏 / 开始菜单出现同名重复图标
!macro customInstall
  Delete "$DESKTOP\知邮 ZhiMail.lnk"
  Delete "$SMPROGRAMS\知邮 ZhiMail.lnk"
  Delete "$SMPROGRAMS\知邮 ZhiMail\知邮 ZhiMail.lnk"
  RMDir "$SMPROGRAMS\知邮 ZhiMail"
!macroend

!macro customUnInstall
  Delete "$DESKTOP\ZhiMail.lnk"
  Delete "$SMPROGRAMS\ZhiMail.lnk"
!macroend
