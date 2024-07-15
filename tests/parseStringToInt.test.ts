import parseStringToInt from "../src/utils/parseStringToInt";

test("Parse integer string", () => {
  expect(parseStringToInt("1234")).toEqual(1234);
});

test("Parse non integer string", () => {
  expect(parseStringToInt("asdas123d")).toEqual(NaN);
});

test("Parse null string", () => {
  expect(parseStringToInt(null)).toEqual(null);
});

test("Parse decimal", () => {
  expect(parseStringToInt("123.4")).toEqual(123);
});

test("Parse boolean to string", () => {
  expect(parseStringToInt(true)).toEqual(null);
});
