# 自动更新源托管方案调研（2026-11-14）

## 结论速览

智邮的自动更新走 electron-updater 的 `generic` provider：客户端只需要一个能取到
`latest.yml` 的 HTTPS 目录地址，安装包地址可以写在 `latest.yml` 的 `path` 字段里，
**且支持绝对 URL**（已核对 `electron-updater/out/util.js` 的 `newUrlFromBase()`：
内部就是 `new URL(pathname, baseUrl)`，绝对地址会直接生效）。

因此「清单放 Manus、安装包放 Manus」完全可行，不需要 GitHub Releases 参与分发。

## 已验证的 Manus 能力

### 1. Manus CDN 文件托管（`manus-upload-file`）

实测上传 `ZhiYou-Setup-1.4.12-x64.exe`（79,481,889 字节）：

```
CDN URL: https://files.manuscdn.com/user_upload_by_module/session_file/310519663268610489/yBKzgBrHyatqrnCC.exe
```

响应头与能力：

| 项目 | 实测结果 |
| --- | --- |
| HTTP 版本 | HTTP/2 200（S3 源站 + CloudFront 边缘） |
| content-length | 79,481,889（与本地一致） |
| accept-ranges | bytes |
| Range 请求 | `curl -r 0-1023` → **206 Partial Content，1024 字节** |
| 下载速度 | 前 8MB 实测约 **50.6 MB/s**（沙箱到边缘） |
| 鉴权 | 无需鉴权，匿名可下载 |

结论：CDN 地址支持 Range，意味着 **electron-updater 的差分更新（blockmap）也能用**，
不必退回整包下载。

注意：URL 形如 `session_file/...`，属于会话上传通道，长期保留策略未在文档中明确，
需要按「可能被回收」来设计（清单里保存安装包绝对地址，一旦失效只需重新上传并更新清单）。

### 2. WebDev 托管（静态站点）

`manus.space` 子域 + 自动 HTTPS，托管模式分两种（见 webdev 技能 hosting 参考）：

- `on_demand`（Autoscale，默认）：空闲会休眠，再次请求有冷启动延迟
- `always_on`（Reserved）：常驻进程，需要会员

资源上限为容器规格表（默认档位，可声明 0.25 vCPU/512MB 起），适合托管体积很小的
`latest.yml`（约 1KB），不适合直接放 75MB 安装包（每次发版都要重新发布整站）。

### 3. Cloud Computer（常驻服务器）

`$10/月 Basic`：2 vCPU / 1GB 内存 / 35GB 存储 / 出网 200GB / 出网带宽 100Mbps，
独立公网 IP，Ubuntu 24.04 + root。适合 nginx + systemd 自建更新站：
200GB 出网约等于 2,600 次 75MB 整包下载。需要自备域名 + Let's Encrypt 才能上 HTTPS
（UFW 默认只开 22 端口，需要 `sudo ufw allow`）。

## 推荐架构（方案 A）

```
GitHub        只放代码（CI 仍负责编译，产物不再作为唯一分发渠道）
   │
   ├── 构建产物 exe / blockmap ──► manus-upload-file ──► files.manuscdn.com（支持 Range）
   │
   └── latest.yml（1KB，含安装包绝对 URL）──► WebDev 静态站（HTTPS 稳定地址）
                                              https://<site>.manus.space/updates/latest.yml
```

客户端只需把「设置 → 在线更新 → 更新源」指向 `https://<site>.manus.space/updates/`，
现有的 generic provider 直接可用（已支持自定义地址，且已自动保存）。

## 待办（确定方案后执行）

- [x] 建一个最小的 WebDev 静态站，暴露 `/updates/latest.yml`（站点已上线）
- [x] 构建后上传 exe + blockmap 到 CDN，生成含绝对地址的 latest.yml 并发布（发版脚本一步完成）
- [x] 客户端默认更新源切到 Manus 地址；「测速并选最快」把 Manus 源加进候选列表
- [x] 清单里记录安装包 sha512，客户端校验（electron-updater 已内置校验）

---

# 落地结果（2026-11-14 已完成）

| 项 | 地址 / 说明 |
| --- | --- |
| 更新清单 | `https://zhiyou-emy2c9va.manus.space/updates/latest.yml`（`cache-control: no-cache`） |
| 下载页 | `https://zhiyou-emy2c9va.manus.space` |
| 安装包（客户端用） | Manus CDN 绝对地址，实测 36–50 MB/s、支持 Range（206） |
| 安装包（下载页用） | 站点同源 `/manus-storage/...`，文件名正确（原名 + 8 位哈希） |

客户端默认更新源为内置「Manus 托管源」；用 GitHub 官方源且未自定义地址的老设置会自动迁移；
自定义地址填的就是本站的，也归位为内置源。GitHub 侧只保留最新一个 Release。

## 发版怎么跑

```bash
# 1. 升版本号 + 写 CHANGELOG → 提交 → 打 tag → CI 构建
# 2. 下载产物
gh release download vX.Y.Z -D /home/ubuntu/zhimail-release
# 3. 生成清单与下载页（必须在站点目录下执行，--webdev 上传需要项目上下文）
cd /home/ubuntu/zhiyou && node /home/ubuntu/zhimail/scripts/publish-update-feed.mjs \
  --config /home/ubuntu/zhimail/update-feed.config.json
# 4. 站点仓库提交推送 → 触发站点发布（webdev.config POST publish）
# 5. 验证：清单 200 + no-cache、version/sha512/size、安装包 206
# 6. GitHub 只留最新 Release：gh release delete <旧tag> --yes --cleanup-tag
```

配置在 `update-feed.config.json`（产品名、产物目录、站点目录、文件名模式、下载页文案）。
脚本按「文件名:大小」缓存已上传地址，重复执行不会重复上传。

## 这套做法已抽成可复用技能

`/home/ubuntu/skills/manus-hosted-updates/SKILL.md`

在其他项目里复用时，只要在会话里说「按 manus-hosted-updates 规范给这个项目接入在线更新」，
或显式读取该 SKILL.md；也可以只把 `scripts/publish-update-feed.mjs` 与配置模板拷进项目使用。
技能内含架构选型对比（CDN / 项目存储 / 静态站直放 / Cloud Computer / GitHub Releases 的实测数据与成本）、
发版手册与已知坑排查。

## 边界

- CDN 的 `session_file` 地址不保证长期有效；失效就重传产物并改写清单，客户端无需改动。
- 项目存储会 307 跳到签名 URL，浏览器可能忽略 `download` 属性，最终文件名带 8 位哈希；
  要完全干净只能自建文件服务器（Cloud Computer，约 $10/月）。
- 站点发布是独立动作：仓库提交只是检查点，必须再触发发布线上才会变。
