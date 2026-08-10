<?php
/**
 * SQLite data layer — drop-in replacement for the old xlsx-as-database layer.
 * Same external contract as before: one "table" per category, rows keyed by
 * an internal "_id", columns are dynamic (whatever the category's data has).
 *
 * This file only handles PROPERTY DATA. Settings/categories/outputs stay as
 * JSON files exactly as before — no reason to move those into SQLite.
 */

function dbPath() {
    return DATA_DIR . 'property_manager.db';
}

function db(): PDO {
    static $pdo;
    if ($pdo) return $pdo;
    $pdo = new PDO('sqlite:' . dbPath());
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('PRAGMA journal_mode = WAL');
    $pdo->exec('PRAGMA foreign_keys = ON');
    return $pdo;
}

function tableName($cat) {
    $cat = preg_replace('/[^a-zA-Z0-9_]/', '', $cat);
    if ($cat === '') $cat = 'cat';
    return 'cat_' . $cat;
}

/** Column-name sanitizer — must match the one used by the Python importer
 *  so a table built by either tool ends up with identical column names. */
function colName($header) {
    $c = preg_replace('/[^\w]+/', '_', trim((string)$header));
    $c = trim(preg_replace('/_+/', '_', $c), '_');
    $c = strtolower($c);
    return $c === '' ? 'col' : $c;
}

function tableExists($table) {
    $stmt = db()->prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?");
    $stmt->execute([$table]);
    return (bool)$stmt->fetchColumn();
}

function tableColumns($table) {
    // returns [sql_col => sql_col] in creation order, '_id' excluded
    $cols = [];
    foreach (db()->query("PRAGMA table_info(\"$table\")") as $row) {
        if ($row['name'] !== '_id') $cols[] = $row['name'];
    }
    return $cols;
}

/** Ensures the table exists and has every column in $headers (original,
 *  human-readable header names). Adds missing columns automatically —
 *  same "your columns auto-appear" behavior the xlsx version had. */
function ensureTable($cat, array $headers) {
    $table = tableName($cat);
    $colMap = [];
    foreach ($headers as $h) $colMap[$h] = colName($h);

    if (!tableExists($table)) {
        $defs = ['"_id" TEXT PRIMARY KEY'];
        foreach ($colMap as $sqlCol) $defs[] = "\"$sqlCol\" TEXT";
        db()->exec("CREATE TABLE \"$table\" (" . implode(', ', $defs) . ')');
    } else {
        $existing = array_merge(['_id'], tableColumns($table));
        foreach ($colMap as $sqlCol) {
            if (!in_array($sqlCol, $existing, true)) {
                db()->exec("ALTER TABLE \"$table\" ADD COLUMN \"$sqlCol\" TEXT");
            }
        }
    }
    return $colMap;
}

/** Mirrors the old getProperties($cat): ['columns'=>[...header names...], 'rows'=>[...]] */
function getProperties($cat) {
    if (!$cat) return errResp('No category');
    $table = tableName($cat);
    if (!tableExists($table)) return ['columns' => [], 'rows' => []];

    // We don't store original header text in SQL (only sanitized column
    // names), so we keep a tiny sidecar map of sqlcol -> original header
    // in a reserved "_meta" table, written whenever ensureTable() runs.
    $headerMap = getHeaderMap($cat); // sqlCol => original header
    $sqlCols   = tableColumns($table);
    $headers   = array_map(fn($c) => $headerMap[$c] ?? $c, $sqlCols);

    $rows = [];
    foreach (db()->query("SELECT * FROM \"$table\"") as $r) {
        $row = ['_id' => $r['_id']];
        foreach ($sqlCols as $c) {
            $header = $headerMap[$c] ?? $c;
            $row[$header] = $r[$c] ?? '';
        }
        $rows[] = $row;
    }
    return ['columns' => $headers, 'rows' => $rows];
}

function metaTable() {
    if (!tableExists('_meta_headers')) {
        db()->exec('CREATE TABLE "_meta_headers" (cat TEXT, sql_col TEXT, header TEXT, PRIMARY KEY (cat, sql_col))');
    }
}

function getHeaderMap($cat) {
    metaTable();
    $stmt = db()->prepare('SELECT sql_col, header FROM "_meta_headers" WHERE cat = ?');
    $stmt->execute([$cat]);
    $map = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) $map[$r['sql_col']] = $r['header'];
    return $map;
}

function saveHeaderMap($cat, array $colMap) {
    metaTable();
    $stmt = db()->prepare('INSERT OR REPLACE INTO "_meta_headers" (cat, sql_col, header) VALUES (?, ?, ?)');
    foreach ($colMap as $header => $sqlCol) $stmt->execute([$cat, $sqlCol, $header]);
}

/** Mirrors writeProperties — but instead of rewriting a whole file, this
 *  does row-level upserts. Used by addRow/updateRow directly; importExcel
 *  uses replaceAllRows() for bulk file-replace semantics.
 *
 *  IMPORTANT: We use UPDATE for existing rows and INSERT for new rows.
 *  INSERT OR REPLACE deletes+reinserts, changing the row's physical position
 *  and making it appear at the end of every SELECT — breaking row order. */
function upsertRow($cat, array $row) {
    $headers = array_keys(array_filter($row, fn($k) => $k !== '_id', ARRAY_FILTER_USE_KEY));
    $colMap  = ensureTable($cat, $headers);
    saveHeaderMap($cat, $colMap);
    $table   = tableName($cat);

    // Check whether the row already exists
    $existsStmt = db()->prepare("SELECT COUNT(*) FROM \"$table\" WHERE \"_id\" = ?");
    $existsStmt->execute([$row['_id']]);
    $isUpdate = (int)$existsStmt->fetchColumn() > 0;

    if ($isUpdate) {
        // UPDATE in place — row keeps its physical position in the table
        $setClauses = [];
        $params     = [];
        foreach ($headers as $h) {
            $setClauses[] = '"' . $colMap[$h] . '" = ?';
            $params[]     = $row[$h] ?? '';
        }
        $params[] = $row['_id'];
        db()->prepare("UPDATE \"$table\" SET " . implode(', ', $setClauses) . " WHERE \"_id\" = ?")
            ->execute($params);
    } else {
        // INSERT for brand-new rows
        $cols   = array_merge(['_id'], array_values($colMap));
        $params = array_merge([$row['_id']], array_map(fn($h) => $row[$h] ?? '', $headers));

        $placeholders = implode(',', array_fill(0, count($cols), '?'));
        $colsSql      = implode(',', array_map(fn($c) => '"'.$c.'"', $cols));
        db()->prepare("INSERT INTO \"$table\" ($colsSql) VALUES ($placeholders)")
            ->execute($params);
    }
}


function addRow($cat, $rowData) {
    $existingCols = getProperties($cat)['columns'];
    if (empty($existingCols)) {
        $existingCols = array_keys(array_filter($rowData, fn($k) => $k !== '_id', ARRAY_FILTER_USE_KEY));
    }
    $firstCol = $existingCols[0] ?? null;
    if ($firstCol && empty($rowData[$firstCol])) {
        $count  = (int)db()->query("SELECT COUNT(*) FROM \"" . tableName($cat) . "\"")->fetchColumn();
        $prefix = strtoupper(substr($cat, 0, 3));
        $rowData[$firstCol] = $prefix . '-' . str_pad($count + 1, 3, '0', STR_PAD_LEFT);
    }

    $rowData['_id'] = 'r_' . substr(md5(uniqid('', true)), 0, 12);
    upsertRow($cat, $rowData);
    return ['ok' => true, 'row' => $rowData];
}

function updateRow($cat, $rowId, $updates) {
    $table = tableName($cat);
    if (!tableExists($table)) return errResp('Row not found: ' . $rowId);
    $stmt = db()->prepare("SELECT \"_id\" FROM \"$table\" WHERE \"_id\" = ?");
    $stmt->execute([$rowId]);
    if (!$stmt->fetchColumn()) return errResp('Row not found: ' . $rowId);

    $updates['_id'] = $rowId;
    upsertRow($cat, $updates);
    return ['ok' => true];
}

function deleteRow($cat, $rowId) {
    $table = tableName($cat);
    if (!tableExists($table)) return errResp('Row not found');
    $stmt = db()->prepare("DELETE FROM \"$table\" WHERE \"_id\" = ?");
    $stmt->execute([$rowId]);
    if ($stmt->rowCount() === 0) return errResp('Row not found');

    foreach (glob(UPLOADS_DIR . '*', GLOB_ONLYDIR) as $catDir) {
        $rowDir = $catDir . DIRECTORY_SEPARATOR . $rowId;
        if (is_dir($rowDir)) {
            array_map('unlink', glob($rowDir . DIRECTORY_SEPARATOR . '*'));
            @rmdir($rowDir);
        }
    }
    return ['ok' => true];
}

/** Full-replace import (matches old importExcel semantics: uploaded file
 *  becomes the new dataset for that category). Drops and recreates the table. */
function replaceAllRows($cat, array $headers, array $rows) {
    $table = tableName($cat);
    db()->exec("DROP TABLE IF EXISTS \"$table\"");
    $colMap = ensureTable($cat, $headers);
    saveHeaderMap($cat, $colMap);

    db()->beginTransaction();
    foreach ($rows as $row) upsertRow($cat, $row);
    db()->commit();
}

/** Returns the value of the row's first visible column (its "Property ID"-
 *  style business identifier) — used for sequential photo naming. */
function rowDisplayId($cat, $rowId) {
    $data = getProperties($cat);
    foreach ($data['rows'] as $row) {
        if ($row['_id'] === $rowId) {
            $firstCol = $data['columns'][0] ?? null;
            $val = $firstCol ? ($row[$firstCol] ?? '') : '';
            return $val !== '' ? $val : $rowId;
        }
    }
    return $rowId;
}