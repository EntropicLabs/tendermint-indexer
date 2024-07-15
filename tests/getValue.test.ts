import getValue from "../src/utils/getValue";

test("Succeed in simple get value", () => {
  const json = {
    a: 2,
  };

  expect(getValue(json, ["a"])).toBe(2);
});

test("Succeed in nested get value", () => {
  const json = {
    a: 2,
    b: {
      c: {
        d: [2, 4],
      },
    },
  };

  expect(getValue(json, ["b", "c", "d"])).toEqual([2, 4]);
});

test("Return null in non-existing get value", () => {
  const json = {
    a: 2,
    b: {
      c: {
        d: [2, 4],
      },
    },
  };

  expect(getValue(json, ["a", "b", "c", "e"])).toEqual(null);
});
