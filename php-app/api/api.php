<?php
/**
 * RCIRL Property Management — API v5 (SQLite edition)
 * Property data lives in SQLite (property_data/property_manager.db).
 * Settings/categories/outputs stay as JSON files — unchanged from before.
 * Photos: filenames now use the property's display ID, sequentially
 * numbered (e.g. RES001_01.jpg, RES001_02.jpg) instead of timestamps.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST');
header('Access-Control-Allow-Headers: Content-Type');

define('ROOT',        dirname(__DIR__) . DIRECTORY_SEPARATOR);
define('DATA_DIR',    ROOT . 'property_data' . DIRECTORY_SEPARATOR);
define('UPLOADS_DIR', ROOT . 'uploads'       . DIRECTORY_SEPARATOR);
define('OUTPUTS_DIR', ROOT . 'outputs'       . DIRECTORY_SEPARATOR);
define('SETTINGS_FILE', DATA_DIR . 'settings.json');
define('CATS_FILE',     DATA_DIR . 'categories.json');
define('OUT_INDEX',     OUTPUTS_DIR . 'index.json');

require_once __DIR__ . '/lib/SimpleXLSX.php';
require_once __DIR__ . '/lib/SimpleXLSXGen.php';
require_once __DIR__ . '/db.php';

use Shuchkin\SimpleXLSX;
use Shuchkin\SimpleXLSXGen;

foreach ([DATA_DIR, UPLOADS_DIR, OUTPUTS_DIR] as $d) {
    if (!is_dir($d)) mkdir($d, 0755, true);
}

$action = $_GET['action'] ?? '';
if (!$action && isset($_POST['action'])) $action = $_POST['action'];
if (!$action) {
    $body   = json_decode(file_get_contents('php://input'), true) ?? [];
    $action = $body['action'] ?? '';
}

switch ($action) {
    case 'get_properties':  echo json_encode(getProperties($_GET['cat'] ?? '')); break;
    case 'add_row':         $b = getBody(); echo json_encode(addRow($b['cat'], $b['row'])); break;
    case 'update_row':      $b = getBody(); echo json_encode(updateRow($b['cat'], $b['row_id'], $b['row'])); break;
    case 'delete_row':      $b = getBody(); echo json_encode(deleteRow($b['cat'], $b['row_id'])); break;
    case 'import_excel':    echo json_encode(importExcel()); break;
    case 'upload_photo':    echo json_encode(uploadPhoto()); break;
    case 'get_photos':      echo json_encode(getPhotos($_GET['cat'] ?? '', $_GET['row_id'] ?? '')); break;
    case 'delete_photo':    $b = getBody(); echo json_encode(deletePhoto($b['cat'], $b['row_id'], $b['filename'])); break;
    case 'save_output':     echo json_encode(saveOutput()); break;
    case 'get_outputs':     echo json_encode(getOutputs()); break;
    case 'delete_output':   $b = getBody(); echo json_encode(deleteOutput($b['filename'])); break;
    case 'get_settings':    echo json_encode(getSettings()); break;
    case 'save_settings':   $b = getBody(); echo json_encode(saveSettings($b)); break;
    case 'get_categories':  echo json_encode(getCategories()); break;
    case 'export_excel':    exportExcelDownload($_GET['cat'] ?? ''); break;
    case 'save_categories': $b = getBody(); echo json_encode(saveCategories($b)); break;
    default:
        http_response_code(400);
        echo json_encode(['error' => 'Unknown action: ' . htmlspecialchars($action)]);
}

// ═══════════════════════════════════════════════════════════════
// IMPORT (uploaded xlsx → SQLite, replaces category's dataset)
// ═══════════════════════════════════════════════════════════════

function importExcel() {
    if (empty($_FILES['file']) || empty($_POST['cat'])) return errResp('Missing file or cat');

    $cat  = preg_replace('/[^a-zA-Z0-9_]/', '', $_POST['cat']);
    $file = $_FILES['file'];

    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, ['xlsx', 'xls'])) return errResp('Only .xlsx or .xls files allowed');

    $xlsx = SimpleXLSX::parse($file['tmp_name']);
    if (!$xlsx) return errResp('Could not parse Excel file — make sure it is a valid .xlsx');

    $raw = $xlsx->rows();
    if (count($raw) < 2) return errResp('File must have at least a header row and one data row');

    $uploadedHeaders = array_map('trim', array_map('strval', $raw[0]));
    $hasId  = in_array('_id', $uploadedHeaders);
    $idIdx  = $hasId ? array_search('_id', $uploadedHeaders) : -1;
    $visible = array_values(array_filter($uploadedHeaders, fn($h) => $h !== '_id'));

    $rows = [];
    for ($i = 1; $i < count($raw); $i++) {
        $rawRow = $raw[$i];
        $vals   = array_map('strval', $rawRow);
        if (implode('', $vals) === '') continue;

        $row = [];
        foreach ($uploadedHeaders as $ci => $h) {
            if ($h === '_id') continue;
            $row[$h] = isset($rawRow[$ci]) ? strval($rawRow[$ci]) : '';
        }
        $row['_id'] = ($hasId && !empty($rawRow[$idIdx]))
            ? strval($rawRow[$idIdx])
            : 'r_' . substr(md5(uniqid('', true)), 0, 12);
        $rows[] = $row;
    }

    replaceAllRows($cat, $visible, $rows);
    return ['ok' => true, 'columns' => $visible, 'count' => count($rows)];
}

// ═══════════════════════════════════════════════════════════════
// PHOTOS — sequential, property-ID-based naming
// ═══════════════════════════════════════════════════════════════

function sanitizePropId($id) {
    $id = preg_replace('/[^a-zA-Z0-9]+/', '', (string)$id);
    return $id !== '' ? strtoupper($id) : 'PROPERTY';
}

function nextPhotoSeq($dir, $prefix) {
    $max = 0;
    foreach (glob($dir . $prefix . '_*.{jpg,jpeg,png,webp}', GLOB_BRACE) ?: [] as $f) {
        if (preg_match('/_(\d+)\.[a-z]+$/i', basename($f), $m)) {
            $max = max($max, (int)$m[1]);
        }
    }
    return $max + 1;
}

function uploadPhoto() {
    if (empty($_FILES['photo']) || empty($_POST['cat']) || empty($_POST['row_id']))
        return errResp('Missing photo, cat, or row_id');

    $cat   = preg_replace('/[^a-zA-Z0-9_]/', '', $_POST['cat']);
    $rowId = preg_replace('/[^a-zA-Z0-9._-]/', '', $_POST['row_id']);
    $file  = $_FILES['photo'];

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime  = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);
    $allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!in_array($mime, $allowed)) return errResp('Only JPG, PNG, WEBP allowed');

    $dir = UPLOADS_DIR . $cat . DIRECTORY_SEPARATOR . $rowId . DIRECTORY_SEPARATOR;
    if (!is_dir($dir)) mkdir($dir, 0755, true);

    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    $ext = in_array($ext, ['jpg', 'jpeg', 'png', 'webp']) ? $ext : 'jpg';

    $prefix   = sanitizePropId(rowDisplayId($cat, $rowId));
    $seq      = nextPhotoSeq($dir, $prefix);
    $filename = sprintf('%s_%02d.%s', $prefix, $seq, $ext);
    $dest     = $dir . $filename;

    if (!move_uploaded_file($file['tmp_name'], $dest)) return errResp('Failed to save photo');

    return ['ok' => true, 'filename' => $filename, 'url' => baseUrl() . 'uploads/' . $cat . '/' . $rowId . '/' . $filename];
}

function getPhotos($cat, $rowId) {
    if (!$cat || !$rowId) return ['photos' => []];
    $cat   = preg_replace('/[^a-zA-Z0-9_]/', '', $cat);
    $rowId = preg_replace('/[^a-zA-Z0-9._-]/', '', $rowId);
    $dir   = UPLOADS_DIR . $cat . DIRECTORY_SEPARATOR . $rowId . DIRECTORY_SEPARATOR;
    if (!is_dir($dir)) return ['photos' => []];

    $files  = glob($dir . '*.{jpg,jpeg,png,webp}', GLOB_BRACE) ?: [];
    $photos = [];
    $base   = baseUrl() . 'uploads/' . $cat . '/' . $rowId . '/';
    foreach ($files as $f) {
        $fn       = basename($f);
        $photos[] = ['filename' => $fn, 'url' => $base . $fn, 'size' => filesize($f), 'modified' => filemtime($f)];
    }
    usort($photos, fn($a, $b) => strcmp($a['filename'], $b['filename']));
    return ['photos' => $photos];
}

function deletePhoto($cat, $rowId, $filename) {
    $cat      = preg_replace('/[^a-zA-Z0-9_]/',   '', $cat);
    $rowId    = preg_replace('/[^a-zA-Z0-9._-]/', '', $rowId);
    $filename = preg_replace('/[^a-zA-Z0-9._-]/', '', $filename);
    $path     = UPLOADS_DIR . $cat . DIRECTORY_SEPARATOR . $rowId . DIRECTORY_SEPARATOR . $filename;
    if (!file_exists($path)) return errResp('File not found');
    unlink($path);
    return ['ok' => true];
}

// ═══════════════════════════════════════════════════════════════
// OUTPUTS — unchanged (JSON index, files on disk)
// ═══════════════════════════════════════════════════════════════

function saveOutput() {
    if (empty($_FILES['file']) || empty($_POST['filename'])) return errResp('Missing file');
    $filename = preg_replace('/[^a-zA-Z0-9._-]/', '_', $_POST['filename']);
    $type     = $_POST['type'] ?? 'pdf';
    $props    = json_decode($_POST['properties'] ?? '[]', true) ?: [];
    $dest     = OUTPUTS_DIR . $filename;
    if (!move_uploaded_file($_FILES['file']['tmp_name'], $dest)) return errResp('Failed to save output');
    $index = readJson(OUT_INDEX, []);
    array_unshift($index, ['filename' => $filename, 'type' => $type, 'properties' => $props, 'size' => filesize($dest), 'created' => date('Y-m-d H:i:s')]);
    writeJson(OUT_INDEX, $index);
    return ['ok' => true, 'filename' => $filename];
}

function getOutputs() {
    $index = readJson(OUT_INDEX, []);
    $base  = baseUrl() . 'outputs/';
    $clean = [];
    foreach ($index as $item) {
        $path = OUTPUTS_DIR . ($item['filename'] ?? '');
        if ($item['filename'] && file_exists($path)) {
            $item['url']  = $base . $item['filename'];
            $item['size'] = filesize($path);
            $clean[]      = $item;
        }
    }
    if (count($clean) !== count($index)) writeJson(OUT_INDEX, $clean);
    return ['outputs' => $clean];
}

function deleteOutput($filename) {
    $filename = preg_replace('/[^a-zA-Z0-9._-]/', '_', $filename);
    $path     = OUTPUTS_DIR . $filename;
    if (file_exists($path)) unlink($path);
    $index = array_values(array_filter(readJson(OUT_INDEX, []), fn($i) => ($i['filename'] ?? '') !== $filename));
    writeJson(OUT_INDEX, $index);
    return ['ok' => true];
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS & CATEGORIES — unchanged (JSON files)
// ═══════════════════════════════════════════════════════════════

function getSettings() {
    if (!file_exists(SETTINGS_FILE)) {
        $d = defaultSettings();
        writeJson(SETTINGS_FILE, $d);
        return $d;
    }
    return readJson(SETTINGS_FILE, defaultSettings());
}
function saveSettings($d)   { writeJson(SETTINGS_FILE, $d); return ['ok' => true]; }
function getCategories()    { return readJson(CATS_FILE, ['custom' => []]); }
function saveCategories($d) { writeJson(CATS_FILE, $d); return ['ok' => true]; }

function defaultSettings() {
    return [
        'companyName' => 'RCIRL Property Consultant',
        'phone'       => '+91 98410 00000',
        'email'       => 'info@rcirl.in',
        'website'     => 'www.rcirl.in',
        'filters'     => [
            'residential' => [
                'BHK'              => ['1 BHK', '2 BHK', '3 BHK', '4 BHK', '4+ BHK'],
                'Furnished Status' => ['Fully Furnished', 'Semi-Furnished', 'Unfurnished'],
                'Type'             => ['Apartment', 'Independent Villa', 'Row House', 'Penthouse', 'Studio'],
                'Availability'     => ['Ready to Move', 'Under Construction'],
                'Facing'           => ['East', 'West', 'North', 'South', 'North-East', 'North-West'],
            ],
            'commercial' => [
                'Property Sub-Type' => ['Office Space', 'Retail Shop', 'Showroom', 'Warehouse', 'Coworking Space', 'Mixed Use'],
                'Transaction Type'  => ['Sale', 'Rent', 'Lease'],
                'Furnished Status'  => ['Bare Shell', 'Warm Shell', 'Plug & Play', 'Fully Fitted'],
            ],
            'industrial' => [
                'Property Sub-Type' => ['Factory Shed', 'Warehouse', 'Cold Storage', 'Light Industrial', 'Industrial Plot'],
                'Transaction Type'  => ['Sale', 'Rent', 'Lease'],
                'Crane Provision'   => ['Yes', 'No'],
            ],
            'land' => [
                'Land Type'            => ['Residential Plot', 'Commercial Plot', 'Agricultural Land', 'Industrial Land', 'Farm Land'],
                'DTCP / CMDA Approved' => ['DTCP Approved', 'CMDA Approved', 'Panchayat', 'SIPCOT'],
                'Facing'               => ['East', 'West', 'North', 'South', 'Corner Plot'],
            ],
        ],
    ];
}

// ═══════════════════════════════════════════════════════════════
// EXPORT — SQLite → xlsx on the fly (keeps the "download Excel" feature)
// ═══════════════════════════════════════════════════════════════

function exportExcelDownload($cat) {
    if (!$cat) { http_response_code(400); echo 'No category'; return; }
    $cat  = preg_replace('/[^a-zA-Z0-9_]/', '', $cat);
    $data = getProperties($cat);
    if (empty($data['columns'])) { http_response_code(404); echo 'No data found'; return; }

    $headers = array_merge(['_id'], $data['columns']);
    $sheet   = [$headers];
    foreach ($data['rows'] as $row) {
        $r = [$row['_id'] ?? ''];
        foreach ($data['columns'] as $col) $r[] = $row[$col] ?? '';
        $sheet[] = $r;
    }

    $meta  = ['residential' => 'Residential', 'commercial' => 'Commercial', 'industrial' => 'Industrial', 'land' => 'Raw_Land'];
    $label = $meta[$cat] ?? ucfirst($cat);
    $name  = 'RCIRL_' . $label . '_' . date('Y-m-d') . '.xlsx';

    // NOTE: fromArray()'s 2nd arg is the sheet NAME, not a styles map.
    // The original app passed a $styles array here, which is silently
    // ignored on PHP 7.4 (a warning) but fatals on PHP 8.1+. Fixed here.
    $xlsx = SimpleXLSXGen::fromArray($sheet, mb_substr($label, 0, 31));
    header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    header('Content-Disposition: attachment; filename="' . $name . '"');
    header('Cache-Control: no-cache');
    $xlsx->downloadAs($name);
    exit;
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function getBody() {
    static $b;
    if ($b === null) $b = json_decode(file_get_contents('php://input'), true) ?? [];
    return $b;
}

function errResp($msg) { return ['error' => $msg]; }

function readJson($file, $default = []) {
    if (!file_exists($file)) return $default;
    $d = json_decode(file_get_contents($file), true);
    return $d !== null ? $d : $default;
}

function writeJson($file, $data) {
    file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

function baseUrl() {
    $proto  = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host   = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $script = $_SERVER['SCRIPT_NAME'] ?? '/api/api.php';
    $base   = str_replace('api/api.php', '', $script);
    return $proto . '://' . $host . $base;
}

function colLetter($n) {
    $r = '';
    while ($n > 0) { $r = chr(65 + ($n - 1) % 26) . $r; $n = intdiv($n - 1, 26); }
    return $r;
}
