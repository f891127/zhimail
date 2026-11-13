; 安装时清理旧品牌（知邮 ZhiMail）残留的快捷方式，避免开始菜单 / 桌面出现两个图标
!macro customInstall
  Delete "$DESKTOP\知邮 ZhiMail.lnk"
  Delete "$SMPROGRAMS\知邮 ZhiMail.lnk"
  Delete "$SMPROGRAMS\知邮 ZhiMail\知邮 ZhiMail.lnk"
  RMDir "$SMPROGRAMS\知邮 ZhiMail"
  Delete "$DESKTOP\ZhiMail.lnk"
  Delete "$SMPROGRAMS\ZhiMail.lnk"
!macroend
!macro customUnInstall
  Delete "$DESKTOP\智邮.lnk"
  Delete "$SMPROGRAMS\智邮.lnk"
  Delete "$DESKTOP\ZhiYou.lnk"
  Delete "$SMPROGRAMS\ZhiYou.lnk"
!macroend
