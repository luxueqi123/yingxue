param([string[]]$PluginIds = @('official-payment-wechat-native', 'official-payment-alipay-page', 'official-payment-xunhupay', 'official-payment-zhifufm', 'official-payment-epay', 'yingxue-payment-cloudcat-epay'))
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$catalog = Join-Path $root 'plugin-packages'
$output = Join-Path $root '.local/cache/payment-packages'
$stagingRoot = Join-Path $root '.local/cache/payment-package-builds'
$commands = @{
    'official-payment-wechat-native' = './cmd/payment-wechat'
    'official-payment-alipay-page' = './cmd/payment-alipay'
    'official-payment-xunhupay' = './cmd/payment-xunhupay'
    'official-payment-zhifufm' = './cmd/payment-zhifufm'
    'official-payment-epay' = './cmd/payment-epay'
    'yingxue-payment-cloudcat-epay' = './cmd/payment-cloudcat'
}
foreach ($id in $PluginIds) { if (-not $commands.ContainsKey($id)) { throw "Unknown payment plugin: $id" } }
$arch = switch ([Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()) { 'X64' { 'amd64' } 'Arm64' { 'arm64' } default { throw 'Unsupported Windows architecture' } }
New-Item -ItemType Directory -Force -Path $output, $stagingRoot | Out-Null
Get-ChildItem -LiteralPath $catalog -File -Filter '*.yingce-plugin' | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $output $_.Name) -Force }
$old = @{ GOOS=$env:GOOS; GOARCH=$env:GOARCH; CGO_ENABLED=$env:CGO_ENABLED }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$receipts = @()
Push-Location (Join-Path $root 'backend')
try {
    $env:GOOS = 'windows'; $env:GOARCH = $arch; $env:CGO_ENABLED = '0'
    foreach ($id in $PluginIds) {
        $source = Join-Path $catalog $id
        $stage = Join-Path $stagingRoot ($id + '-' + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Force -Path (Join-Path $stage 'backend') | Out-Null
        foreach ($name in @('manifest.json', 'README.md', 'LICENSE', 'docs', 'assets')) {
            $path = Join-Path $source $name
            if (Test-Path -LiteralPath $path) { Copy-Item -LiteralPath $path -Destination $stage -Recurse }
        }
        $binary = Join-Path $stage "backend/provider-windows-$arch.exe"
        & go build -trimpath -o $binary $commands[$id]
        if ($LASTEXITCODE -ne 0) { throw "Build failed: $id" }
        $info = & go version -m $binary
        if ($LASTEXITCODE -ne 0 -or ($info -join "`n") -notmatch "GOARCH=$arch" -or ($info -join "`n") -notmatch 'GOOS=windows') { throw "Build target mismatch: $id" }
        Copy-Item -LiteralPath $binary -Destination (Join-Path $stage 'backend/provider')
        $temporary = Join-Path $output ($id + '.' + [guid]::NewGuid().ToString('N') + '.tmp')
        [IO.Compression.ZipFile]::CreateFromDirectory($stage, $temporary)
        $package = Join-Path $output ($id + '.yingce-plugin')
        Move-Item -LiteralPath $temporary -Destination $package -Force
        $receipts += @{ id=$id; target="windows/$arch"; sha256=(Get-FileHash -LiteralPath $package -Algorithm SHA256).Hash.ToLowerInvariant() }
    }
} finally {
    Pop-Location
    $env:GOOS=$old.GOOS; $env:GOARCH=$old.GOARCH; $env:CGO_ENABLED=$old.CGO_ENABLED
}
$receipts | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $output 'local-build-receipt.json') -Encoding utf8
Write-Output "Prepared local catalog: $output"
Write-Output 'Set CANVAS_OFFICIAL_PLUGIN_DIR to this directory for local runtime tests. Production still uses the Docker target-platform build.'
