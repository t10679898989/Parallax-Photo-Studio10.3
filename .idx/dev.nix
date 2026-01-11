{ pkgs, ... }: {
  # 選擇穩定的 Nix 版本
  channel = "stable-23.11"; 

  # 在這裡安裝需要的軟體包
  packages = [
    pkgs.nodejs_20
    pkgs.jdk17  # <--- 這就是我們要的 Java！
  ];

  # 設定環境變數
  env = {};
}