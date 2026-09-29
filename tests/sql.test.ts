import assert from 'node:assert/strict';
import { test } from 'node:test';

import { inClause, insertStatement, updateStatement, whereClause } from '@/data/sql';

test('insertStatement construit les colonnes depuis l’objet, dans l’ordre', () => {
  const statement = insertStatement('vehicles', { id: 'v1', plate: 'GK-482-LM', currentMileageKm: 125_400 });
  assert.equal(statement.sql, 'INSERT INTO vehicles (id, plate, currentMileageKm) VALUES (?, ?, ?)');
  assert.deepEqual(statement.params, ['v1', 'GK-482-LM', 125_400]);
});

test('insertStatement convertit une valeur absente en null, jamais en « undefined »', () => {
  // Un `undefined` lié à SQLite est une erreur d'exécution, pas une valeur nulle.
  const statement = insertStatement('tenants', { id: 't1', birthDate: undefined as unknown as string });
  assert.deepEqual(statement.params, ['t1', null]);
});

test('insertStatement refuse une ligne vide', () => {
  assert.throws(() => insertStatement('vehicles', {}), /ligne vide/);
});

test('updateStatement met à jour toutes les colonnes sauf l’identifiant', () => {
  const statement = updateStatement('vehicles', 'v1', { id: 'v1', plate: 'GK-482-LM', currentMileageKm: 126_000 });
  assert.equal(statement.sql, 'UPDATE vehicles SET plate = ?, currentMileageKm = ? WHERE id = ?');
  assert.deepEqual(statement.params, ['GK-482-LM', 126_000, 'v1']);
});

test('updateStatement refuse une mise à jour sans colonne', () => {
  assert.throws(() => updateStatement('vehicles', 'v1', { id: 'v1' }), /rien à mettre à jour/);
});

test('inClause produit le bon nombre de marqueurs, et jamais « IN () »', () => {
  assert.deepEqual(inClause('id', ['a', 'b']), { sql: 'id IN (?, ?)', params: ['a', 'b'] });
  // `IN ()` n'est pas du SQL valide : une liste vide doit rendre une condition fausse.
  assert.deepEqual(inClause('id', []), { sql: '0 = 1', params: [] });
});

test('whereClause assemble les conditions non vides', () => {
  assert.equal(whereClause([]), '');
  assert.equal(whereClause(['', '   ']), '');
  assert.equal(whereClause(['archivedAt IS NULL', '']), ' WHERE archivedAt IS NULL');
  assert.equal(
    whereClause(['archivedAt IS NULL', 'vehicleId = ?']),
    ' WHERE archivedAt IS NULL AND vehicleId = ?',
  );
});
