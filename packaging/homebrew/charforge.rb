cask "charforge" do
  arch arm: "aarch64", intel: "x64"

  version "__VERSION__"
  sha256 arm:   "__SHA_ARM__",
         intel: "__SHA_INTEL__"

  url "https://github.com/hrozno2/charforge/releases/download/v#{version}/CharForge_#{version}_#{arch}.dmg"
  name "CharForge"
  desc "D&D 5e (2024) character builder with custom modifiers and PDF export"
  homepage "https://github.com/hrozno2/charforge"

  livecheck do
    url :url
    strategy :github_latest
  end

  # The app updates itself, so Homebrew should not reinstall it on every `brew upgrade`.
  auto_updates true
  depends_on macos: ">= :catalina"

  app "CharForge.app"

  # The app is not notarized, so clear the quarantine flag to avoid the "damaged" warning.
  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-cr", "#{appdir}/CharForge.app"]
  end

  zap trash: [
    "~/Library/Application Support/app.charforge.desktop",
    "~/Library/Caches/app.charforge.desktop",
    "~/Library/WebKit/app.charforge.desktop",
  ]
end
