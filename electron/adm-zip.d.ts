/**
 * adm-zip 自带类型已废弃（@types/adm-zip 为占位包），这里按实际用到的 API 声明。
 */
declare module 'adm-zip' {
  export interface AdmZipEntry {
    entryName: string;
    header: { size: number };
    getData(): Buffer;
  }

  export default class AdmZip {
    constructor(filePath?: string);
    addFile(entryName: string, content: Buffer): void;
    getEntries(): AdmZipEntry[];
    extractAllTo(targetPath: string, overwrite?: boolean): void;
    writeZip(targetFileName: string): void;
  }
}
