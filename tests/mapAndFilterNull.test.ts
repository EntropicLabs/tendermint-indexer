import mapAndFilterNull from "../src/utils/mapAndFilterNull";

test("Map and filter mixed list", () => {
  expect(
    mapAndFilterNull([1, 2, null, 3], (data) =>
      data != null ? data * 2 : null
    )
  ).toEqual([2, 4, 6]);
});

test("Map and filter all null list", () => {
  expect(
    mapAndFilterNull([null, null], (data) => (data != null ? data * 2 : null))
  ).toEqual([]);
});

test("Map and filter empty list", () => {
  expect(
    mapAndFilterNull([], (data) => (data != null ? data * 2 : null))
  ).toEqual([]);
});
