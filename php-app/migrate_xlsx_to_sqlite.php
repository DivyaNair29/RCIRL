<?php
/**
 * One-time migration: property_data/*.xlsx -> property_data/property_manager.db
 *
 * Run this ONCE after deploying the SQLite version, pointed at your existing
 * xlsx files. After this runs successfully, api.php reads/writes SQLite only;
 * the xlsx files are no longer touched (keep them as a backup, don't delete).
 *
 * Usage (CLI, on the server via SSH):
 *   php migrate_xlsx_to_sqlite.php
 *
 * Usage (browser, if you don't have SSH on Hostinger):
 *   Upload this file to your site root and visit:
 *   https://yourdomain.com/migrate_xlsx_to_sqlite.php?key=YOUR_SECRET
 *   (set $WEB_KEY below first, then DELETE this file after running it once)
 */

$WEB_KEY = 'change-me-before-uploading'; // set this, then check it matches ?key=

if (php_sapi_name() !== 'cli') {
    if (($_GET['key'] ?? '') !== $WEB_KEY || $WEB_KEY === 'change-me-before-uploading') {
        http_response_code(403);
        die('Set $WEB_KEY in this file, then pass it as ?key=...');
    }
    header('Content-Type: text/plain');
}

define('ROOT',        __DIR__ . DIRECTORY_SEPARATOR);

// On Railway use /data volume; locally use relative paths
$_is_railway = !empty(getenv('RAILWAY_ENVIRONMENT')) || !empty(getenv('RAILWAY_PROJECT_ID'));
define('DATA_DIR',    $_is_railway ? '/data/property_data/'  : ROOT . 'property_data' . DIRECTORY_SEPARATOR);
define('UPLOADS_DIR', $_is_railway ? '/data/uploads/'        : ROOT . 'uploads'       . DIRECTORY_SEPARATOR);
unset($_is_railway);

require_once __DIR__ . '/api/lib/SimpleXLSX.php';
require_once __DIR__ . '/api/db.php';

use Shuchkin\SimpleXLSX;

$files = [
    'residential' => 'residential.xlsx',
    'commercial'  => 'commercial.xlsx',
    'industrial'  => 'industrial.xlsx',
    'land'        => 'land.xlsx',
];

// Also pick up any other *.xlsx in property_data/ not in the list above
foreach (glob(DATA_DIR . '*.xlsx') as $path) {
    $base = basename($path, '.xlsx');
    if (!in_array($base . '.xlsx', $files, true) && !isset($files[$base])) {
        $files[$base] = basename($path);
    }
}

echo "Migrating xlsx files from " . DATA_DIR . " into property_manager.db\n\n";

foreach ($files as $cat => $filename) {
    $path = DATA_DIR . $filename;
    if (!file_exists($path)) {
        echo "  [skip] $filename not found\n";
        continue;
    }

    $xlsx = SimpleXLSX::parse($path);
    if (!$xlsx) {
        echo "  [fail] $filename — could not parse: " . SimpleXLSX::parseError() . "\n";
        continue;
    }

    $raw = $xlsx->rows();
    if (count($raw) < 1) {
        echo "  [skip] $filename — empty\n";
        continue;
    }

    $headers = array_map('strval', $raw[0]);
    $hasId   = in_array('_id', $headers, true);
    $idIdx   = $hasId ? array_search('_id', $headers) : -1;
    $visible = array_values(array_filter($headers, fn($h) => $h !== '_id'));

    $rows = [];
    for ($i = 1; $i < count($raw); $i++) {
        $rawRow = $raw[$i];
        $vals   = array_map('strval', $rawRow);
        if (implode('', $vals) === '') continue;

        $row = [];
        foreach ($headers as $ci => $h) {
            if ($h === '_id') continue;
            $row[$h] = isset($rawRow[$ci]) ? strval($rawRow[$ci]) : '';
        }
        $row['_id'] = ($hasId && !empty($rawRow[$idIdx]))
            ? strval($rawRow[$idIdx])
            : 'r_' . substr(md5(uniqid('', true)), 0, 12);
        $rows[] = $row;
    }

    $table = tableName($cat);
    $alreadyHadTable = tableExists($table);
    $existingIds = [];
    if ($alreadyHadTable) {
        foreach (db()->query("SELECT \"_id\" FROM \"$table\"") as $r) $existingIds[] = $r['_id'];
    }

    $colMap = ensureTable($cat, $visible);
    saveHeaderMap($cat, $colMap);

    $inserted = $skipped = 0;
    foreach ($rows as $row) {
        if (in_array($row['_id'], $existingIds, true)) { $skipped++; continue; }
        upsertRow($cat, $row);
        $existingIds[] = $row['_id'];
        $inserted++;
    }

    echo "  [ok]   $filename -> table \"$table\": $inserted inserted, $skipped already present\n";
}

echo "\nDone. property_manager.db is at: " . dbPath() . "\n";
echo "api.php now reads/writes SQLite — the original xlsx files are untouched (kept as backup).\n";