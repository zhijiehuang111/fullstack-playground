# VPS 初始設定

## 環境
- Provider: DigitalOcean
- OS: Ubuntu

---

## 1. 更新系統套件

進新機器第一件事。

```bash
apt update && apt upgrade -y
```

---

## 2. 建立一般使用者

不用 root 直接操作，防止手滑指令直接生效。

```bash
adduser <username>
usermod -aG sudo <username>
```

把 SSH public key 複製給新使用者，並設定正確權限（SSH 要求 `.ssh` 只有擁有者能讀）：

```bash
chmod 700 /home/<username>/.ssh
chmod 600 /home/<username>/.ssh/authorized_keys
```

---

## 3. 關閉密碼登入與 root SSH

編輯 `/etc/ssh/sshd_config`，改這兩行（去掉 `#` 並設為 no）：

```
PasswordAuthentication no
PermitRootLogin no
```

```bash
sudo systemctl restart ssh  # 重啟 ssh 服務讓設定生效
```

改完先用新 session 測試能連才關掉舊 session。

---

## 4. 防火牆 + 暴力破解防護

```bash
sudo apt install -y fail2ban ufw

sudo ufw allow OpenSSH   # 必須先開 SSH port
sudo ufw enable
```

`fail2ban` 會自動偵測 SSH 暴力破解並封鎖 IP。
`ufw` 負責管理哪些 port 對外開放。
