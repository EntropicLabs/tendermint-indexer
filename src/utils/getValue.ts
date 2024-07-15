type JSONObject = {
  [key: string]: any;
};

/**
 * Returns the value in a nested JSON object given a list of keys
 * @param object JSON object
 * @param keys String of keys to be applied in order
 * @returns The value if all keys exist or null
 */
export default function getValue(object: JSONObject, keys: string[]) {
  return keys.reduce((currentObject: JSONObject | null, key) => {
    if (currentObject == null) {
      return null;
    }

    return currentObject[key as keyof typeof currentObject];
  }, object);
}
