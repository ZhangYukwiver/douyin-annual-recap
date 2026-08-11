import type { DocumentPickerAsset } from "expo-document-picker";
import { Platform } from "react-native";

import {
  MAX_ARCHIVE_BYTES,
  parsePersonalArchiveBytes,
  PersonalArchiveError,
} from "../domain/personalArchiveParser";
import type { PersonalArchiveData } from "../domain/personalRecords";

async function readWebFile(asset: DocumentPickerAsset): Promise<Uint8Array> {
  if (!asset.file) {
    throw new PersonalArchiveError("unsupported_format", "浏览器没有提供可读取的文件。");
  }

  return new Uint8Array(await asset.file.arrayBuffer());
}

async function readNativeFile(asset: DocumentPickerAsset): Promise<Uint8Array> {
  const { File } = await import("expo-file-system");
  return new File(asset.uri).bytes();
}

async function releaseTemporaryFile(asset: DocumentPickerAsset): Promise<void> {
  if (Platform.OS === "web") {
    if (asset.uri.startsWith("blob:")) URL.revokeObjectURL(asset.uri);
    return;
  }

  try {
    const { File } = await import("expo-file-system");
    new File(asset.uri).delete();
  } catch {
    // The picker cache may already have released the temporary copy.
  }
}

export async function importPersonalArchive(asset: DocumentPickerAsset): Promise<PersonalArchiveData> {
  if (asset.size !== undefined && asset.size > MAX_ARCHIVE_BYTES) {
    throw new PersonalArchiveError("too_large", "个人信息文件超过 32 MB，请选择仅包含记录的导出文件。");
  }

  try {
    const bytes = Platform.OS === "web" ? await readWebFile(asset) : await readNativeFile(asset);
    return parsePersonalArchiveBytes(bytes, asset.name);
  } finally {
    await releaseTemporaryFile(asset);
  }
}

export function describePersonalArchiveError(error: unknown): string {
  if (error instanceof PersonalArchiveError) return error.message;
  return "文件读取失败，请确认它来自抖音官方个人信息下载并重试。";
}
