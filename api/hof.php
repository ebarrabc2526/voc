<?php
error_reporting(E_ALL);
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');

$dataDir = __DIR__ . '/../data';
$file    = $dataDir . '/hof.json';

// Asegura que el directorio existe y es escribible
if (!is_dir($dataDir)) {
    if (!mkdir($dataDir, 0755, true)) {
        http_response_code(500);
        echo json_encode(['error' => 'No se pudo crear data/', 'dir' => $dataDir]);
        exit;
    }
}
if (!is_writable($dataDir)) {
    http_response_code(500);
    echo json_encode(['error' => 'data/ no tiene permisos de escritura', 'dir' => $dataDir]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

// ── GET ───────────────────────────────────────────────────────────────────────
if ($method === 'GET') {
    echo file_exists($file) ? file_get_contents($file) : '[]';
    exit;
}

// ── POST ──────────────────────────────────────────────────────────────────────
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input || empty(trim($input['name'] ?? ''))) {
        http_response_code(400);
        echo json_encode(['error' => 'Nombre requerido']);
        exit;
    }

    $entry = [
        'name'      => substr(htmlspecialchars(trim($input['name']), ENT_QUOTES), 0, 20),
        'level'     => $input['level']     ?? '',
        'mode'      => $input['mode']      ?? '',
        'challenge' => $input['challenge'] ?? '',
        'category'  => $input['category']  ?? '',
        'score'     => (int)($input['score']   ?? 0),
        'correct'   => (int)($input['correct'] ?? 0),
        'total'     => (int)($input['total']   ?? 0),
        'date'      => $input['date']      ?? '',
    ];

    $hof = [];
    if (file_exists($file)) {
        $hof = json_decode(file_get_contents($file), true) ?: [];
    }

    $hof[] = $entry;
    usort($hof, fn($a, $b) => $b['score'] <=> $a['score']);
    $hof = array_slice($hof, 0, 500);

    file_put_contents($file, json_encode($hof, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);

    echo json_encode(['ok' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
