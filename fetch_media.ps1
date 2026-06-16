[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media, ContentType = WindowsRuntime] | Out-Null
$manager = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync().GetAwaiter().GetResult()
if ($null -eq $manager) {
    Write-Output "No Manager"
    exit
}
$session = $manager.GetCurrentSession()
if ($null -eq $session) {
    Write-Output "No Session"
    exit
}
$mediaProperties = $session.TryGetMediaPropertiesAsync().GetAwaiter().GetResult()
Write-Output "$($mediaProperties.Artist) - $($mediaProperties.Title)"
