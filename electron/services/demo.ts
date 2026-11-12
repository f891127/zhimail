/**
 * 演示模式：首次启动写入一个内置「演示邮箱」，包含长邮件、会话串、附件与各类办公场景邮件，
 * 让用户在未配置真实邮箱时也能完整体验界面、AI 汇总、简报与待办流程。
 */

import fs from 'node:fs';
import { store } from './store';
import { assignThreadIds } from './thread';
import { ensureDefaultFolders, folderIdFor } from './accounts';
import type { AttachmentMeta, Folder, MailAddress, MessageMeta } from './types';

export const DEMO_ACCOUNT_ID = 'demo-account';
const DEMO_EMAIL = 'demo@zhimail.local';

interface DemoMessage {
  key: string;
  folder: 'inbox' | 'sent' | 'draft';
  subject: string;
  from: { name: string; address: string };
  to: { name: string; address: string }[];
  cc?: { name: string; address: string }[];
  daysAgo: number;
  hour: number;
  minute?: number;
  body: string[];
  htmlTable?: { header: string[]; rows: string[][] };
  attachment?: { filename: string; contentType: string; size: number; content: string };
  unread?: boolean;
  flagged?: boolean;
  messageId: string;
  references?: string[];
  inReplyTo?: string;
}

const ME = { name: '房秀杰', address: DEMO_EMAIL };

const DEMO_MESSAGES: DemoMessage[] = [
  {
    key: 'sterilizer-review',
    folder: 'inbox',
    subject: '关于 1.2m³ 脉动真空灭菌器电气控制方案评审的几点意见',
    from: { name: '李文博', address: 'liwenbo@xinhua-med.com' },
    to: [ME],
    cc: [{ name: '赵敏', address: 'zhaomin@xinhua-med.com' }],
    daysAgo: 1,
    hour: 9,
    minute: 12,
    unread: true,
    flagged: true,
    messageId: '<review-1200-001@xinhua-med.com>',
    attachment: {
      filename: 'DE-H1200电气原理图V3.2.pdf',
      contentType: 'application/pdf',
      size: 2_486_312,
      content: '（演示附件）DE-H1200 电气原理图 V3.2 —— 主回路、控制回路、安全回路分段说明。',
    },
    body: [
      '秀杰：',
      '上周五的评审会纪要我整理完了，电气控制方案还有几处需要你在本周内确认，涉及安全联锁与验证追溯，麻烦优先看第 2、4 条。',
      '一、安全联锁逻辑。现行方案在门密封未到位时仅报警不停机，GB 8599-2008 第 5.4.7 条要求门未锁紧不得升压。建议把门到位信号（S3、S4 双冗余）直接串入加热与抽真空回路，而不是只做 PLC 内部互锁。请确认改造后是否影响现有的自检流程。',
      '二、温度压力记录。验证报告要求灭菌阶段温度记录间隔不大于 1 分钟、压力记录间隔不大于 2 分钟。目前 HMI 的历史曲线是 2 分钟采样，建议改为 30 秒，并同步调整数据存储策略——按每天 40 锅次估算，年数据量约 3.2 GB，需要确认工控机硬盘容量与备份方案。',
      '三、灭菌参数组。客户（华东医疗器械 CSSD）要求增加 134℃/4min 的预真空程序，与现有 132℃/6min 并存。程序切换时是否需要强制做一次 B-D 测试？我在方案里暂时写成「可选」，需要你给出工艺意见。',
      '四、报警追溯。审计追踪要求记录报警确认人与确认时间，当前 HMI 只记录发生时间。这部分涉及用户权限体系，如果要做，建议与登录模块一起改，工作量约 3 人日。',
      '五、交期。客户要求 12 月 20 日前到货，电气部分如果按上面四条全改，BOM 变更与软件回归测试至少需要 10 个工作日。请评估是否分批交付：先按现有方案交付主机，软件升级后续现场更新。',
      '以上请在本周四前给个结论，我要汇总后回复客户。',
      '李文博',
      '研发部 / 新华医疗',
    ],
  },
  {
    key: 'validation-thread-1',
    folder: 'inbox',
    subject: 'Re: 灭菌验证报告（第三批）数据复核',
    from: { name: '王丽', address: 'wangli@huadong-cssd.com' },
    to: [ME],
    daysAgo: 3,
    hour: 14,
    minute: 26,
    messageId: '<val-003-1@huadong-cssd.com>',
    body: [
      '房工：',
      '第三批验证的 12 锅次数据我们复核完了，有 2 锅次的生物指示剂培养结果需要复测：',
      '第 7 锅（11 月 6 日 14:20）嗜热脂肪芽孢杆菌出现 1 管阳性；第 9 锅（11 月 7 日 09:05）同批次指示剂也有 1 管阳性。其余 10 锅次全部阴性。',
      '我们已经排查了装载方式，第 7 锅确实存在器械包堆叠超出装载图的情况，第 9 锅装载正常。同批次指示剂我们留了 5 管做对照，正在培养中。',
      '想请你确认：这种情况下是否需要重新做连续 3 锅次的空载 B-D 测试，还是只复测问题锅次即可？另外设备侧的记录能否导出 11 月 6 日至 7 日的完整温度压力曲线，我们想对比一下。',
      '王丽 / 华东医疗器械 CSSD',
    ],
  },
  {
    key: 'validation-thread-2',
    folder: 'sent',
    subject: 'Re: 灭菌验证报告（第三批）数据复核',
    from: ME,
    to: [{ name: '王丽', address: 'wangli@huadong-cssd.com' }],
    daysAgo: 3,
    hour: 16,
    minute: 2,
    messageId: '<val-003-2@zhimail.local>',
    references: ['<val-003-1@huadong-cssd.com>'],
    inReplyTo: '<val-003-1@huadong-cssd.com>',
    body: [
      '王丽：',
      '收到，两点回复。',
      '一、按 GB 8599 与 WS 310.3 的要求，出现阳性时应对该灭菌周期判定为不合格，并在查明原因后重新进行连续 3 锅次验证（含 1 次空载 B-D）。所以不是只复测问题锅次，需要连续 3 锅次。',
      '二、曲线我今天下午导出，包含腔体温度（T1/T2）、夹层压力、腔体压力与记录时间戳，采样间隔 30 秒，格式为 CSV 与 PDF 各一份。',
      '另外建议同批次指示剂对照培养结果出来后一并归档，避免后续追溯时说不清。',
      '房秀杰',
    ],
  },
  {
    key: 'validation-thread-3',
    folder: 'inbox',
    subject: 'Re: 灭菌验证报告（第三批）数据复核',
    from: { name: '王丽', address: 'wangli@huadong-cssd.com' },
    to: [ME],
    daysAgo: 2,
    hour: 10,
    minute: 40,
    unread: true,
    messageId: '<val-003-3@huadong-cssd.com>',
    references: ['<val-003-1@huadong-cssd.com>', '<val-003-2@zhimail.local>'],
    inReplyTo: '<val-003-2@zhimail.local>',
    body: [
      '房工：',
      '明白了，我们安排 11 月 14 日上午做连续 3 锅次验证，空载 B-D 放在第一锅之前。',
      '对照培养的 5 管全部阴性，说明指示剂本身没问题，问题应该出在装载与蒸汽质量上。我们同时联系了蒸汽供应方检查管网疏水。',
      '曲线文件收到了，第 7 锅在升温段确实有一段 40 秒的温度平台（121℃ 左右停留），这个是不是蒸汽含水量偏高的表现？麻烦你帮忙看一下。',
      '王丽',
    ],
  },
  {
    key: 'supplier-delay',
    folder: 'inbox',
    subject: '【交期变更】真空泵与电磁阀到货延期通知',
    from: { name: '陈志强', address: 'chenzq@buchi-vacuum.cn' },
    to: [ME],
    daysAgo: 2,
    hour: 15,
    minute: 8,
    unread: true,
    flagged: true,
    messageId: '<delay-2026-1108@buchi-vacuum.cn>',
    attachment: {
      filename: '延期说明及替代方案.pdf',
      contentType: 'application/pdf',
      size: 512_400,
      content: '（演示附件）真空泵 XD-40 与电磁阀 2W-025 延期说明，含替代型号参数对比。',
    },
    body: [
      '房经理：',
      '很抱歉通知您，原定 11 月 20 日交货的 XD-40 旋片式真空泵（订单 PO-2026-0917，数量 6 台）因上游铸件供应问题，交期需推迟至 12 月 8 日；配套电磁阀 2W-025 同步延期至 12 月 5 日。',
      '为减少对您项目的影响，我们提供两个方案：',
      '方案一：先用库存的 XD-40B（抽速 40 m³/h，极限真空 0.5 mbar，与原型号一致，接口尺寸相同，仅噪音高 2 dB）替代 3 台，剩余 3 台 12 月 8 日交付。',
      '方案二：整单等待至 12 月 8 日统一交付，我们承担 3% 的延期违约金。',
      '请您在 11 月 12 日前回复选择哪个方案，以便我们锁定库存。',
      '陈志强 / 布驰真空设备',
    ],
  },
  {
    key: 'customer-inquiry',
    folder: 'inbox',
    subject: '询价：CSSD 消毒供应中心整体改造（含 2 台 1.5m³ 灭菌器）',
    from: { name: '刘建国', address: 'liujg@renji-hospital.cn' },
    to: [ME],
    daysAgo: 5,
    hour: 11,
    minute: 30,
    messageId: '<inquiry-renji-2026@renji-hospital.cn>',
    body: [
      '房经理您好：',
      '我院计划 2027 年一季度完成消毒供应中心改造，需要采购 2 台 1.5m³ 脉动真空压力蒸汽灭菌器，以及配套的清洗消毒机 3 台、干燥柜 2 台。',
      '基本要求：',
      '1. 灭菌器需满足 GB 8599-2008 与 WS 310.2 要求，具备 B-D 测试、泄漏测试、真空测试程序；',
      '2. 需提供完整的验证文件包（IQ/OQ/PQ），并配合我院完成第三方检测；',
      '3. 控制系统需具备审计追踪与电子签名功能，数据可导出；',
      '4. 安装场地层高 3.6 米，承重需现场勘察。',
      '请贵司在 11 月 20 日前提供技术方案与报价，并安排一次现场勘察。联系人：设备科 刘建国，电话 021-6xxx xxxx。',
      '上海市仁济医院 设备科',
    ],
  },
  {
    key: 'quality-issue',
    folder: 'inbox',
    subject: '质量异常：批次 B2409 门密封圈早期老化（附检测数据）',
    from: { name: '孙倩', address: 'sunqian@quality.xinhua-med.com' },
    to: [ME],
    cc: [{ name: '李文博', address: 'liwenbo@xinhua-med.com' }],
    daysAgo: 6,
    hour: 8,
    minute: 45,
    unread: true,
    messageId: '<qa-b2409@quality.xinhua-med.com>',
    htmlTable: {
      header: ['检验项', '标准要求', '实测值', '判定'],
      rows: [
        ['硬度（邵氏 A）', '65±5', '58', '不合格'],
        ['拉伸强度', '≥8 MPa', '7.2 MPa', '不合格'],
        ['压缩永久变形', '≤25%', '31%', '不合格'],
        ['耐温老化（134℃×72h）', '外观无裂纹', '表面微裂', '不合格'],
      ],
    },
    body: [
      '各位：',
      '批次 B2409 的硅胶门密封圈在到货检验中出现早期老化迹象，抽检 10 件中有 6 件硬度低于下限，具体数据见下表。',
      '该批次已装配到 4 台整机上（工单号 WO-2026-1023 至 1026），其中 2 台已发货至客户现场。',
      '初步判断为供应商混用了低牌号硅胶原料。请研发确认：',
      '1. 已发货的 2 台是否需要现场更换密封圈？更换工时与停机影响如何评估？',
      '2. 在库的 4 台整机是否全部拆检？',
      '3. 是否需要对该批次客户发函说明？',
      '请在本周三前回复处理意见，质量部需要闭环。',
      '孙倩 / 质量部',
    ],
  },
  {
    key: 'meeting-notice',
    folder: 'inbox',
    subject: '会议通知：11 月产品例会（11 月 14 日 14:00，三楼会议室）',
    from: { name: '周晓芸', address: 'zhouxiaoyun@xinhua-med.com' },
    to: [ME],
    daysAgo: 1,
    hour: 17,
    minute: 20,
    messageId: '<meeting-1114@xinhua-med.com>',
    body: [
      '各位同事：',
      '11 月产品例会定于 11 月 14 日（周五）14:00 在三楼第二会议室召开，预计 90 分钟。',
      '议题：',
      '1. 1.2m³ 灭菌器项目进度与风险（李文博）；',
      '2. 批次 B2409 密封圈质量异常处理方案（孙倩）；',
      '3. 华东 CSSD 验证复测安排（房秀杰）；',
      '4. 12 月交付计划与产能匹配（生产部）。',
      '请各议题负责人准备 5 分钟以内的汇报材料，会前发我汇总。',
      '周晓芸 / 产品部',
    ],
  },
  {
    key: 'standard-update',
    folder: 'inbox',
    subject: '标准动态：YY/T 0646-2022 相关条款解读与产品符合性自查',
    from: { name: '中国医疗器械行业协会', address: 'notice@camdi.org.cn' },
    to: [ME],
    daysAgo: 8,
    hour: 10,
    minute: 0,
    messageId: '<std-yyt0646@camdi.org.cn>',
    body: [
      '各会员单位：',
      'YY/T 0646-2022《小型压力蒸汽灭菌器》已于近期实施，现将与在用产品相关的自查要点提示如下：',
      '1. 灭菌周期参数应在说明书中明确列出，并与实测曲线一致；',
      '2. 应有独立的超温保护装置，且动作后需人工复位；',
      '3. 门锁紧装置应具备双重视别，任一失效时不得进入升压阶段；',
      '4. 应提供灭菌效果的日常监测方法（化学指示卡、生物指示剂）。',
      '请各单位于 12 月 31 日前完成自查并留存记录。本邮件为通知类邮件，无需回复。',
    ],
  },
  {
    key: 'finance-approval',
    folder: 'inbox',
    subject: '费用审批：CSSD 项目现场服务差旅预算（待您审批）',
    from: { name: '财务共享中心', address: 'expense@xinhua-med.com' },
    to: [ME],
    daysAgo: 4,
    hour: 9,
    minute: 5,
    messageId: '<exp-2026-1106@xinhua-med.com>',
    body: [
      '房秀杰您好：',
      '您提交的《华东 CSSD 项目现场服务差旅预算》已进入审批流程，当前节点为您本人审批。',
      '预算金额：12,860 元（交通 4,200 元、住宿 5,600 元、餐补 1,860 元、其他 1,200 元）。',
      '出差时间：11 月 13 日至 11 月 18 日，共 6 天。',
      '请在 11 月 12 日 18:00 前完成审批，逾期将顺延至下月结算。',
    ],
  },
  {
    key: 'training-invite',
    folder: 'inbox',
    subject: '培训邀请：灭菌器验证与确认（IQ/OQ/PQ）实务培训，11 月 21 日',
    from: { name: '苏州医疗器械培训中心', address: 'training@sz-mdi.com' },
    to: [ME],
    daysAgo: 9,
    hour: 13,
    minute: 40,
    messageId: '<train-1121@sz-mdi.com>',
    body: [
      '房老师您好：',
      '我院定于 11 月 21 日举办「灭菌器验证与确认实务」专题培训，诚邀您作为讲师分享《脉动真空灭菌器验证中的常见偏差分析》，时长 90 分钟。',
      '培训对象为医院 CSSD 护士长与设备科工程师，预计 60 人。',
      '如您方便，请于 11 月 15 日前回复确认，并将讲义发我们排版。课酬按中心标准执行。',
      '感谢支持！',
    ],
  },
  {
    key: 'spare-parts',
    folder: 'inbox',
    subject: '备件申请：B-D 测试包与生物指示剂库存告急',
    from: { name: '赵敏', address: 'zhaomin@xinhua-med.com' },
    to: [ME],
    daysAgo: 7,
    hour: 16,
    minute: 12,
    messageId: '<spare-1105@xinhua-med.com>',
    body: [
      '房工：',
      '实验室的 B-D 测试包只剩 8 个，生物指示剂（嗜热脂肪芽孢杆菌）剩 20 支，按目前每周 3 次验证的频率，最多撑两周。',
      '上次采购走的是年度框架协议，供应商报价：B-D 测试包 68 元/个（100 个起订），生物指示剂 12 元/支（200 支起订）。',
      '是否需要现在下单？如果走框架协议需要你确认技术参数没变。',
      '赵敏',
    ],
  },
  {
    key: 'sent-quote',
    folder: 'sent',
    subject: '回复：1.5m³ 灭菌器技术方案与初步报价',
    from: ME,
    to: [{ name: '刘建国', address: 'liujg@renji-hospital.cn' }],
    daysAgo: 4,
    hour: 15,
    minute: 45,
    messageId: '<quote-renji-2026@zhimail.local>',
    references: ['<inquiry-renji-2026@renji-hospital.cn>'],
    inReplyTo: '<inquiry-renji-2026@renji-hospital.cn>',
    body: [
      '刘主任您好：',
      '感谢信任。针对贵院改造需求，我们初步方案如下：',
      '一、灭菌器：2 台 1.5m³ 脉动真空灭菌器，双门贯通式，满足 GB 8599-2008、WS 310.2，配置 B-D 测试、泄漏测试、真空测试程序，控制系统具备审计追踪与电子签名，数据支持 CSV/PDF 导出。',
      '二、验证文件：提供完整 IQ/OQ/PQ 文件包，配合第三方检测，预计现场验证 5 个工作日。',
      '三、初步报价：灭菌器 2 台合计 186 万元（含安装调试与验证配合），清洗消毒机与干燥柜待现场勘察后单独报价。',
      '四、现场勘察：建议安排在 11 月 18 日至 20 日之间，我方派 2 名工程师，需贵院提供设备层平面图与承重资料。',
      '正式方案与报价单我会在 11 月 19 日前发送。',
      '房秀杰 / 新华医疗',
    ],
  },
  {
    key: 'draft-weekly',
    folder: 'draft',
    subject: '本周工作小结（11 月 4 日 - 11 月 8 日）',
    from: ME,
    to: [{ name: '周晓芸', address: 'zhouxiaoyun@xinhua-med.com' }],
    daysAgo: 0,
    hour: 18,
    minute: 30,
    messageId: '<draft-weekly-1108@zhimail.local>',
    body: [
      '周经理：',
      '本周主要推进三件事：',
      '1. 1.2m³ 灭菌器电气方案评审，收集研发意见 5 条，其中安全联锁与报警追溯需要改设计；',
      '2. 华东 CSSD 第三批验证出现 2 锅次阳性，已给出复测方案，客户安排 11 月 14 日重做；',
      '3. 仁济医院改造项目完成初步方案与报价沟通。',
      '下周计划：（待补充）',
    ],
  },
  {
    key: 'customer-complaint',
    folder: 'inbox',
    subject: '客户反馈：灭菌后器械包出现湿包现象（附现场照片说明）',
    from: { name: '张海涛', address: 'zhanght@first-hospital.cn' },
    to: [ME],
    daysAgo: 10,
    hour: 9,
    minute: 55,
    unread: true,
    messageId: '<wetpack-2026-1030@first-hospital.cn>',
    attachment: {
      filename: '湿包现场记录.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 1_204_800,
      content: '（演示附件）湿包现场记录：含 6 张照片说明与装载方式记录。',
    },
    body: [
      '房工：',
      '我院 3 号灭菌器最近一周连续出现湿包，主要集中在骨科器械包（重量 7.5 kg，双层无纺布包装）。',
      '现象：出锅后包内可见明显水珠，器械轴节处有积水，干燥时间设定 20 分钟。',
      '已排查：蒸汽管路疏水阀上周刚更换；装载方式按厂家图示执行；真空泵运行正常，抽真空至 -0.09 MPa 无异常。',
      '请协助分析原因，是否需要现场检测蒸汽干度？我院下周有检查，希望能尽快解决。',
      '张海涛 / 第一医院 设备科',
    ],
  },
  {
    key: 'internal-approval',
    folder: 'inbox',
    subject: '请审批：灭菌器控制软件 V3.2 版本发布申请',
    from: { name: '李文博', address: 'liwenbo@xinhua-med.com' },
    to: [ME],
    daysAgo: 11,
    hour: 14,
    minute: 15,
    messageId: '<release-v32@xinhua-med.com>',
    body: [
      '秀杰：',
      '控制软件 V3.2 已完成回归测试，主要变更：',
      '1. 新增 134℃/4min 预真空程序；',
      '2. 报警记录增加确认人与确认时间字段；',
      '3. 历史曲线采样间隔由 2 分钟调整为 30 秒；',
      '4. 修复 B-D 测试程序在低温环境下误报的问题（缺陷号 BUG-2217）。',
      '测试报告与变更清单已上传至 PLM（编号 SW-CR-2026-041）。',
      '请审批后安排发布，客户现场升级需要同步更新说明书第 6 章。',
    ],
  },
  {
    key: 'newsletter',
    folder: 'inbox',
    subject: '行业周报：2026 年第 45 周 医疗器械灭菌领域动态',
    from: { name: '医械观察', address: 'weekly@medwatch.com.cn' },
    to: [ME],
    daysAgo: 3,
    hour: 7,
    minute: 30,
    messageId: '<newsletter-w45@medwatch.com.cn>',
    body: [
      '本周要点：',
      '1. 国家药监局发布《医疗器械灭菌确认指南（征求意见稿）》，对再验证周期提出更明确要求；',
      '2. 某省级集采公布 CSSD 设备中标结果，脉动真空灭菌器平均降价 12%；',
      '3. 行业协会统计：2026 年前三季度压力蒸汽灭菌器市场规模同比增长 6.8%。',
      '如需退订请点击文末链接。',
    ],
  },
  {
    key: 'vendor-quote',
    folder: 'inbox',
    subject: '报价单：PLC 与触摸屏选型替换方案（含成本对比）',
    from: { name: '吴敏', address: 'wumin@automation-partner.cn' },
    to: [ME],
    daysAgo: 12,
    hour: 11,
    minute: 5,
    messageId: '<plc-quote-2026@automation-partner.cn>',
    htmlTable: {
      header: ['方案', 'PLC 型号', '触摸屏', '单台成本', '交期'],
      rows: [
        ['原方案', 'S7-1200 CPU1214C', 'KTP700 Basic', '4,860 元', '4 周'],
        ['替代 A', '汇川 AM400', 'IT7000-070', '3,120 元', '2 周'],
        ['替代 B', '信捷 XD5E', 'TG765-MT', '2,780 元', '1 周'],
      ],
    },
    body: [
      '房工：',
      '针对贵司灭菌器控制方案降本需求，我们整理了三套选型对比，详见上表。',
      '替代方案的主要差异在于：编程环境不同（需重新移植程序，约 8 人日）；Modbus 通讯需增加网关；长期供货稳定性需要评估。',
      '如果确定切换，我们可提供样机测试与程序移植支持。请告知倾向方案，我们出正式报价。',
      '吴敏 / 自动化合作伙伴',
    ],
  },
];

function textToHtml(lines: string[], table?: { header: string[]; rows: string[][] }): string {
  const paragraphs = lines
    .map((line) => `<p style="margin:0 0 12px 0;line-height:1.75;">${escapeHtml(line)}</p>`)
    .join('');
  const tableHtml = table
    ? `<table style="border-collapse:collapse;width:100%;margin:12px 0;font-size:13px;">
        <thead><tr>${table.header
          .map(
            (cell) =>
              `<th style="border:1px solid #d9dde2;background:#eef5fd;padding:6px 10px;text-align:left;color:#123a6e;">${escapeHtml(cell)}</th>`,
          )
          .join('')}</tr></thead>
        <tbody>${table.rows
          .map(
            (row) =>
              `<tr>${row
                .map(
                  (cell) =>
                    `<td style="border:1px solid #d9dde2;padding:6px 10px;">${escapeHtml(cell)}</td>`,
                )
                .join('')}</tr>`,
          )
          .join('')}</tbody>
      </table>`
    : '';
  return `<div style="font-family:'Microsoft YaHei',sans-serif;font-size:14px;color:#1f2329;">${paragraphs}${tableHtml}</div>`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function addresses(list: { name: string; address: string }[]): MailAddress[] {
  return list.map((item) => ({ name: item.name, address: item.address }));
}

function buildTimestamp(daysAgo: number, hour: number, minute = 0): number {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);
  return date.getTime();
}

const DEMO_BRIEF_MARKDOWN = `## 一、整体概览
近一周邮件主要集中在三条主线：1.2m³ 脉动真空灭菌器的电气方案评审、华东 CSSD 第三批验证的偏差处理、以及仁济医院改造项目的售前推进。整体节奏偏紧，验证偏差与门密封圈质量异常是本周最需要闭环的两件事。

## 二、重点邮件
| 时间 | 发件人 | 主题 | 核心结论 / 诉求 |
| --- | --- | --- | --- |
| 11-07 | 李文博 | 1.2m³ 灭菌器电气控制方案评审意见 | 提出 5 条修改意见，安全联锁需串入加热回路，要求周四前回复 |
| 11-06 | 孙倩 | 批次 B2409 门密封圈早期老化 | 抽检 10 件中 6 件不合格，涉及 4 台整机，需研发给处理意见 |
| 11-05 | 王丽 | 第三批验证数据复核 | 2 锅次生物指示剂阳性，需连续 3 锅次复测 |
| 11-04 | 刘建国 | 仁济医院改造询价 | 2 台 1.5m³ 灭菌器，要求 11-20 前报方案 |
| 11-03 | 陈志强 | 真空泵交期延期 | 延期至 12-08，提供替代型号方案，需 11-12 前答复 |

## 三、主题聚类
- **灭菌器电气方案**：涉及 3 封邮件，核心是安全联锁与数据采样间隔，需研发与工艺共同确认。
- **验证与质量异常**：涉及 4 封邮件，包含生物指示剂阳性与密封圈老化两个独立问题，均已启动处理。
- **售前与交付**：涉及 3 封邮件，仁济医院项目进入方案阶段，真空泵延期影响 12 月交付节奏。

## 四、风险与异常
- 真空泵延期 18 天，若客户不接受替代方案，12 月交付存在违约风险。
- 密封圈批次问题已波及 2 台已发货设备，存在现场停机与客户投诉风险。
- 验证复测安排在 11-14，与产品例会时间冲突，需提前协调。

## 五、跟进建议
- 今日内回复李文博评审意见，明确安全联锁改造范围与交期影响（责任人：房秀杰）。
- 与质量部确认已发货 2 台的现场更换方案，评估停机时间（责任人：孙倩、房秀杰）。
- 11-12 前答复布驰真空的替代方案，同步客户交付计划（责任人：房秀杰）。
- 11-19 前完成仁济医院正式方案与报价（责任人：房秀杰）。

## 六、待办事项
- [ ] 回复 1.2m³ 灭菌器电气方案评审意见（5 条） ｜ 截止：本周四 ｜ 优先级：高
- [ ] 确认已发货 2 台的密封圈现场更换方案 ｜ 截止：本周三 ｜ 优先级：高
- [ ] 答复真空泵替代方案并同步客户 ｜ 截止：11-12 ｜ 优先级：高
- [ ] 导出 11-06 至 11-07 温度压力曲线并发王丽 ｜ 截止：已完成 ｜ 优先级：中
- [ ] 协调 11-14 验证复测与产品例会时间冲突 ｜ 截止：11-13 ｜ 优先级：中`;

/** 首次启动时播种演示数据 */
export function seedDemoData(force = false): { seeded: boolean } {
  const existing = store.getAccount(DEMO_ACCOUNT_ID);
  if (existing && !force) return { seeded: false };
  if (existing && force) {
    store.removeAccount(DEMO_ACCOUNT_ID);
  }

  const account = {
    id: DEMO_ACCOUNT_ID,
    name: '演示邮箱',
    email: DEMO_EMAIL,
    displayName: '房秀杰（演示）',
    imap: { host: 'demo.zhimail.local', port: 993, secure: true, user: DEMO_EMAIL },
    smtp: { host: 'demo.zhimail.local', port: 465, secure: true, user: DEMO_EMAIL },
    syncDays: 30,
    demo: true,
    color: '#1F6FD0',
    createdAt: Date.now(),
  };
  store.upsertAccount(account);
  ensureDefaultFolders(DEMO_ACCOUNT_ID);

  // 自定义文件夹：客户项目
  const projectFolder: Folder = {
    id: folderIdFor(DEMO_ACCOUNT_ID, 'project-cssd'),
    accountId: DEMO_ACCOUNT_ID,
    name: 'CSSD 项目',
    kind: 'custom',
    deletable: true,
    order: 10,
    local: true,
  };
  store.upsertFolder(projectFolder);

  const metas: MessageMeta[] = [];
  for (const [index, demo] of DEMO_MESSAGES.entries()) {
    const folderId = folderIdFor(DEMO_ACCOUNT_ID, demo.folder);
    const uid = 1000 + index;
    const date = buildTimestamp(demo.daysAgo, demo.hour, demo.minute ?? 0);
    const html = textToHtml(demo.body, demo.htmlTable);
    const text = demo.body.join('\n\n');

    const attachments: AttachmentMeta[] = [];
    if (demo.attachment) {
      const messageKey = `${DEMO_ACCOUNT_ID}/${folderId}/${uid}`;
      const filePath = store.attachmentPath(messageKey, demo.attachment.filename);
      try {
        fs.writeFileSync(filePath, demo.attachment.content, 'utf8');
      } catch {
        /* 忽略附件写入失败 */
      }
      attachments.push({
        index: 0,
        filename: demo.attachment.filename,
        contentType: demo.attachment.contentType,
        size: demo.attachment.size,
        localPath: filePath,
      });
    }

    const flags = ['\\Seen'];
    if (demo.unread) flags.pop();
    if (demo.flagged) flags.push('\\Flagged');

    metas.push({
      id: `${DEMO_ACCOUNT_ID}/${folderId}/${uid}`,
      accountId: DEMO_ACCOUNT_ID,
      folderId,
      uid,
      messageId: demo.messageId,
      subject: demo.subject,
      from: addresses([demo.from]),
      to: addresses(demo.to),
      cc: addresses(demo.cc ?? []),
      date,
      size: 4096 + text.length * 3,
      flags,
      hasAttachments: attachments.length > 0,
      snippet: text.replace(/\s+/g, ' ').slice(0, 180),
      inReplyTo: demo.inReplyTo,
      references: demo.references,
    });

    store.saveMessageBody(DEMO_ACCOUNT_ID, folderId, uid, { text, html, attachments });
  }

  assignThreadIds(metas, store.allMessages());
  store.upsertMessageMetas(metas);

  // 示例简报
  const now = Date.now();
  store.saveBrief({
    id: 'brief-demo-weekly',
    title: '邮件周报 · 上周汇总（示例）',
    kind: 'weekly',
    rangeStart: now - 7 * 86400000,
    rangeEnd: now,
    createdAt: now - 3600000,
    provider: 'deepseek',
    model: 'deepseek-chat',
    scopeLabel: '全部账户收件箱',
    messageCount: metas.length,
    todoCount: 5,
    markdown: DEMO_BRIEF_MARKDOWN,
    stats: {
      total: metas.length,
      unread: metas.filter((meta) => !meta.flags.includes('\\Seen')).length,
      withAttachment: metas.filter((meta) => meta.hasAttachments).length,
      senders: [
        { name: '李文博', count: 3 },
        { name: '王丽', count: 3 },
        { name: '孙倩', count: 1 },
        { name: '刘建国', count: 1 },
      ],
      busiestDay: { day: new Date(now - 86400000).toISOString().slice(0, 10), count: 4 },
    },
    messageIds: metas.slice(0, 8).map((meta) => meta.id),
    auto: false,
    group: 'briefs/weekly',
  });

  // 示例待办
  store.upsertTodos([
    {
      id: 'todo-demo-1',
      title: '回复 1.2m³ 灭菌器电气方案评审意见（5 条）',
      detail: '安全联锁需串入加热与抽真空回路；报警追溯需增加确认人与确认时间。',
      due: new Date(now + 2 * 86400000).toISOString().slice(0, 10),
      priority: 'high',
      done: false,
      createdAt: now - 7200000,
      briefId: 'brief-demo-weekly',
      sourceMessageId: metas[0]?.id,
      sourceSubject: '关于 1.2m³ 脉动真空灭菌器电气控制方案评审的几点意见',
      sourceFrom: '李文博',
    },
    {
      id: 'todo-demo-2',
      title: '确认已发货 2 台设备的密封圈现场更换方案',
      detail: '批次 B2409 抽检 6/10 不合格，已发货 2 台需评估停机影响。',
      due: new Date(now + 86400000).toISOString().slice(0, 10),
      priority: 'high',
      done: false,
      createdAt: now - 5400000,
      sourceSubject: '质量异常：批次 B2409 门密封圈早期老化',
      sourceFrom: '孙倩',
    },
    {
      id: 'todo-demo-3',
      title: '答复真空泵替代方案并同步客户交付计划',
      detail: 'XD-40B 可替代 3 台，需在 11-12 前回复。',
      due: new Date(now + 3 * 86400000).toISOString().slice(0, 10),
      priority: 'high',
      done: false,
      createdAt: now - 3600000,
      sourceSubject: '【交期变更】真空泵与电磁阀到货延期通知',
      sourceFrom: '陈志强',
    },
    {
      id: 'todo-demo-4',
      title: '协调 11-14 验证复测与产品例会时间冲突',
      detail: '复测上午进行，例会 14:00 开始，需确认是否可提前结束。',
      due: new Date(now + 2 * 86400000).toISOString().slice(0, 10),
      priority: 'medium',
      done: false,
      createdAt: now - 1800000,
      sourceSubject: '会议通知：11 月产品例会',
      sourceFrom: '周晓芸',
    },
    {
      id: 'todo-demo-5',
      title: '导出 11-06 至 11-07 温度压力曲线并发王丽',
      priority: 'medium',
      done: true,
      createdAt: now - 5 * 86400000,
      doneAt: now - 4 * 86400000,
      sourceSubject: '灭菌验证报告（第三批）数据复核',
      sourceFrom: '王丽',
    },
  ]);

  store.updateSettings({ bootstrapped: true });
  return { seeded: true };
}
