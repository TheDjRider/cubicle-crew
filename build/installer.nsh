; Деинсталиране: махаме записа за старт с Windows (Electron го пише под AppUserModelId),
; иначе остава да сочи към изтрит exe. При обновяване (isUpdated) не го пипаме.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.pixeloffice.desktop"
  ${endIf}
!macroend
