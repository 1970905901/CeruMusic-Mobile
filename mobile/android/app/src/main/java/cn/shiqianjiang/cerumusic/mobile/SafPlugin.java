package cn.shiqianjiang.cerumusic.mobile;

import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Locale;

@CapacitorPlugin(name = "Saf")
public class SafPlugin extends Plugin {
    private static final int MAX_CHILDREN = 5000;

    @PluginMethod
    public void pickDirectory(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, intent, "directoryPicked");
    }

    @ActivityCallback
    private void directoryPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null) {
            call.reject("已取消选择文件夹");
            return;
        }
        Uri uri = result.getData().getData();
        if (uri == null) {
            call.reject("没有取得文件夹地址");
            return;
        }
        try {
            getContext().getContentResolver().takePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            );
        } catch (SecurityException first) {
            try {
                getContext().getContentResolver().takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                );
            } catch (SecurityException ignored) {
                // The document provider may only grant access for this session.
            }
        }
        JSObject ret = new JSObject();
        ret.put("uri", uri.toString());
        ret.put("name", documentName(uri));
        call.resolve(ret);
    }

    @PluginMethod
    public void listChildren(PluginCall call) {
        String value = call.getString("uri");
        if (value == null || value.isEmpty()) {
            call.reject("缺少文件夹地址");
            return;
        }
        ContentResolver resolver = getContext().getContentResolver();
        Uri uri = Uri.parse(value);
        String documentId;
        try {
            documentId = DocumentsContract.isTreeUri(uri)
                ? DocumentsContract.getTreeDocumentId(uri)
                : DocumentsContract.getDocumentId(uri);
        } catch (Exception error) {
            call.reject("无法读取文件夹身份");
            return;
        }
        Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(uri, documentId);
        String[] projection = new String[] {
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_SIZE,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED
        };
        JSArray items = new JSArray();
        boolean truncated = false;
        try (Cursor cursor = resolver.query(childrenUri, projection, null, null, null)) {
            if (cursor == null) {
                call.reject("系统没有返回文件夹内容");
                return;
            }
            int idIndex = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DOCUMENT_ID);
            int nameIndex = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DISPLAY_NAME);
            int mimeIndex = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_MIME_TYPE);
            int sizeIndex = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_SIZE);
            int modifiedIndex = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED);
            while (cursor.moveToNext()) {
                if (items.length() >= MAX_CHILDREN) {
                    truncated = true;
                    break;
                }
                String id = cursor.getString(idIndex);
                String mime = cursor.isNull(mimeIndex) ? "" : cursor.getString(mimeIndex);
                boolean directory = DocumentsContract.Document.MIME_TYPE_DIR.equals(mime);
                JSObject item = new JSObject();
                item.put("uri", DocumentsContract.buildDocumentUriUsingTree(uri, id).toString());
                item.put("name", cursor.isNull(nameIndex) ? "" : cursor.getString(nameIndex));
                item.put("mime", mime);
                item.put("directory", directory);
                item.put("size", sizeIndex >= 0 && !cursor.isNull(sizeIndex) ? cursor.getLong(sizeIndex) : 0);
                item.put(
                    "modifiedAt",
                    modifiedIndex >= 0 && !cursor.isNull(modifiedIndex) ? cursor.getLong(modifiedIndex) : 0
                );
                items.put(item);
            }
        } catch (Exception error) {
            call.reject("读取文件夹失败：" + error.getMessage());
            return;
        }
        JSObject ret = new JSObject();
        ret.put("items", items);
        ret.put("truncated", truncated);
        call.resolve(ret);
    }

    @PluginMethod
    public void copyToApp(PluginCall call) {
        String value = call.getString("uri");
        if (value == null || value.isEmpty()) {
            call.reject("缺少文件地址");
            return;
        }
        String requestedName = call.getString("name", "audio");
        Uri uri = Uri.parse(value);
        File directory = new File(getContext().getFilesDir(), "saf-import");
        if (!directory.exists() && !directory.mkdirs()) {
            call.reject("无法创建导入目录");
            return;
        }
        File target = uniqueFile(directory, safeName(requestedName));
        long total = 0;
        try (
            InputStream input = getContext().getContentResolver().openInputStream(uri);
            OutputStream output = new FileOutputStream(target)
        ) {
            if (input == null) {
                target.delete();
                call.reject("无法打开所选文件");
                return;
            }
            byte[] buffer = new byte[65536];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
                total += read;
            }
        } catch (Exception error) {
            if (target.exists()) target.delete();
            call.reject("复制文件失败：" + error.getMessage());
            return;
        }
        JSObject ret = new JSObject();
        ret.put("relativePath", "saf-import/" + target.getName());
        ret.put("name", target.getName());
        ret.put("size", total);
        ret.put("uri", uri.toString());
        call.resolve(ret);
    }

    @PluginMethod
    public void writeFromApp(PluginCall call) {
        String sourcePath = call.getString("sourcePath");
        String treeValue = call.getString("treeUri");
        String relativePath = call.getString("relativePath");
        String mime = call.getString("mime", "application/octet-stream");
        if (sourcePath == null || sourcePath.isEmpty() || treeValue == null || treeValue.isEmpty() || relativePath == null || relativePath.isEmpty()) {
            call.reject("缺少下载写入参数");
            return;
        }
        String[] segments = relativePath.split("/");
        for (String segment : segments) {
            if (segment.isEmpty() || segment.equals(".") || segment.equals("..")) {
                call.reject("下载路径无效");
                return;
            }
        }
        if (segments.length < 2) {
            call.reject("下载路径必须包含文件名");
            return;
        }
        try {
            File root = getContext().getFilesDir().getCanonicalFile();
            File source = new File(root, sourcePath).getCanonicalFile();
            if (!source.getPath().startsWith(root.getPath() + File.separator)) {
                call.reject("下载源文件路径无效");
                return;
            }
            if (!source.isFile()) {
                call.reject("下载源文件不存在");
                return;
            }
            Uri treeUri = Uri.parse(treeValue);
            ContentResolver resolver = getContext().getContentResolver();
            Uri parent = DocumentsContract.buildDocumentUriUsingTree(
                treeUri,
                DocumentsContract.getTreeDocumentId(treeUri)
            );
            for (int index = 0; index < segments.length - 1; index++) {
                parent = ensureDirectory(resolver, treeUri, parent, segments[index]);
            }
            String fileName = segments[segments.length - 1];
            deleteExistingChild(resolver, treeUri, parent, fileName, false);
            Uri document = DocumentsContract.createDocument(resolver, parent, mime, fileName);
            if (document == null) {
                call.reject("系统没有创建下载文件");
                return;
            }
            long total = 0;
            try (
                InputStream input = new java.io.FileInputStream(source);
                OutputStream output = resolver.openOutputStream(document, "w")
            ) {
                if (output == null) {
                    DocumentsContract.deleteDocument(resolver, document);
                    call.reject("系统没有提供下载文件输出流");
                    return;
                }
                byte[] buffer = new byte[65536];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                    total += read;
                }
            } catch (Exception error) {
                try {
                    DocumentsContract.deleteDocument(resolver, document);
                } catch (Exception ignored) {
                }
                call.reject("写入下载文件失败：" + error.getMessage());
                return;
            }
            JSObject ret = new JSObject();
            ret.put("uri", document.toString());
            ret.put("name", fileName);
            ret.put("relativePath", relativePath);
            ret.put("size", total);
            call.resolve(ret);
        } catch (Exception error) {
            call.reject("SAF 下载写入失败：" + error.getMessage());
        }
    }

    @PluginMethod
    public void deleteDocument(PluginCall call) {
        String value = call.getString("uri");
        if (value == null || value.isEmpty()) {
            call.reject("缺少文件地址");
            return;
        }
        try {
            boolean deleted = DocumentsContract.deleteDocument(getContext().getContentResolver(), Uri.parse(value));
            JSObject ret = new JSObject();
            ret.put("deleted", deleted);
            call.resolve(ret);
        } catch (Exception error) {
            call.reject("删除 SAF 文件失败：" + error.getMessage());
        }
    }

    private Uri ensureDirectory(ContentResolver resolver, Uri treeUri, Uri parent, String name) throws Exception {
        Uri existing = findChild(resolver, treeUri, parent, name, true);
        if (existing != null) return existing;
        Uri created = DocumentsContract.createDocument(resolver, parent, DocumentsContract.Document.MIME_TYPE_DIR, name);
        if (created == null) throw new Exception("系统没有创建下载子目录：" + name);
        return created;
    }

    private Uri findChild(ContentResolver resolver, Uri treeUri, Uri parent, String name, boolean directory) throws Exception {
        String parentId = DocumentsContract.getDocumentId(parent);
        Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentId);
        try (Cursor cursor = resolver.query(
            childrenUri,
            new String[] {
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE
            },
            null,
            null,
            null
        )) {
            if (cursor == null) return null;
            int idIndex = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DOCUMENT_ID);
            int nameIndex = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DISPLAY_NAME);
            int mimeIndex = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_MIME_TYPE);
            while (cursor.moveToNext()) {
                String childName = cursor.isNull(nameIndex) ? "" : cursor.getString(nameIndex);
                String mime = cursor.isNull(mimeIndex) ? "" : cursor.getString(mimeIndex);
                boolean isDirectory = DocumentsContract.Document.MIME_TYPE_DIR.equals(mime);
                if (name.equals(childName) && isDirectory == directory) {
                    return DocumentsContract.buildDocumentUriUsingTree(treeUri, cursor.getString(idIndex));
                }
            }
        }
        return null;
    }

    private void deleteExistingChild(ContentResolver resolver, Uri treeUri, Uri parent, String name, boolean directory) throws Exception {
        Uri existing = findChild(resolver, treeUri, parent, name, directory);
        if (existing != null) DocumentsContract.deleteDocument(resolver, existing);
    }

    private String documentName(Uri uri) {
        try (Cursor cursor = getContext().getContentResolver().query(
            uri,
            new String[] { OpenableColumns.DISPLAY_NAME },
            null,
            null,
            null
        )) {
            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) {
                String name = cursor.getString(0);
                if (name != null && !name.isEmpty()) return name;
            }
        } catch (Exception ignored) {
        }
        try {
            return DocumentsContract.getTreeDocumentId(uri);
        } catch (Exception ignored) {
            return "Android 文件夹";
        }
    }

    private String safeName(String value) {
        String name = new File(value == null ? "audio" : value).getName();
        name = name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (name.isEmpty() || name.equals(".") || name.equals("..")) name = "audio";
        if (name.length() <= 180) return name;
        int dot = name.lastIndexOf('.');
        String extension = dot > 0 && name.length() - dot <= 12 ? name.substring(dot) : "";
        return name.substring(0, Math.max(1, 180 - extension.length())) + extension;
    }

    private File uniqueFile(File directory, String name) {
        File target = new File(directory, name);
        if (!target.exists()) return target;
        int dot = name.lastIndexOf('.');
        String stem = dot > 0 ? name.substring(0, dot) : name;
        String extension = dot > 0 ? name.substring(dot) : "";
        for (int index = 2; index < 10000; index++) {
            target = new File(directory, String.format(Locale.US, "%s (%d)%s", stem, index, extension));
            if (!target.exists()) return target;
        }
        target = new File(directory, System.currentTimeMillis() + extension);
        return target;
    }
}
