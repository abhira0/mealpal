import { describe, expect, it } from "vitest";
import { mealItemBody } from "@/views/agenda-data";

describe("mealItemBody", () => {
  it("recipe → recipeId + servings", () => {
    expect(mealItemBody({ kind: "recipe", refId: 5, servings: 3, amount: "" })).toEqual({
      recipeId: 5,
      servings: 3,
    });
  });

  it("product with no amount → servings", () => {
    expect(mealItemBody({ kind: "product", refId: 7, servings: 2, amount: "" })).toEqual({
      productId: 7,
      servings: 2,
    });
  });

  it("product with amount → amount wins over servings", () => {
    expect(mealItemBody({ kind: "product", refId: 7, servings: 2, amount: "150" })).toEqual({
      productId: 7,
      amount: 150,
    });
  });

  it("ingredient → ingredientId + numeric amount", () => {
    expect(mealItemBody({ kind: "ingredient", refId: 9, servings: 1, amount: "43" })).toEqual({
      ingredientId: 9,
      amount: 43,
    });
  });
});
