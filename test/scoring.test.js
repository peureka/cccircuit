const test = require("node:test");
const assert = require("node:assert/strict");
const { scoreForStatus, scoreForMember, topN } = require("../lib/scoring");

test("scoreForStatus: tapped -> 1", () => {
  assert.equal(scoreForStatus("tapped"), 1);
});

test("scoreForStatus: floor -> 4 (cumulative: 1 + 3)", () => {
  assert.equal(scoreForStatus("floor"), 4);
});

test("scoreForStatus: voucher -> 14 (cumulative: 1 + 3 + 10)", () => {
  assert.equal(scoreForStatus("voucher"), 14);
});

test("scoreForStatus: unknown / undefined / null -> 0", () => {
  assert.equal(scoreForStatus("whatever"), 0);
  assert.equal(scoreForStatus(undefined), 0);
  assert.equal(scoreForStatus(null), 0);
});

test("scoreForMember sums all vouches attributed to that member", () => {
  const vouches = [
    { from_member_id: "m1", status: "tapped" }, // 1
    { from_member_id: "m1", status: "floor" }, // 4
    { from_member_id: "m2", status: "voucher" }, // 14
    { from_member_id: "m1", status: "voucher" }, // 14
  ];
  assert.equal(scoreForMember(vouches, "m1"), 1 + 4 + 14);
  assert.equal(scoreForMember(vouches, "m2"), 14);
  assert.equal(scoreForMember(vouches, "nobody"), 0);
});

test("scoreForMember returns 0 for empty vouch list", () => {
  assert.equal(scoreForMember([], "m1"), 0);
});

test("topN returns top N members by score in descending order", () => {
  const vouches = [
    { from_member_id: "m1", status: "tapped" }, // 1
    { from_member_id: "m1", status: "voucher" }, // 14  -> m1 = 15
    { from_member_id: "m2", status: "voucher" }, // 14
    { from_member_id: "m2", status: "voucher" }, // 14  -> m2 = 28
    { from_member_id: "m3", status: "tapped" }, // 1   -> m3 = 1
  ];
  const top = topN(vouches, 10);
  assert.deepEqual(top, [
    { memberId: "m2", score: 28 },
    { memberId: "m1", score: 15 },
    { memberId: "m3", score: 1 },
  ]);
});

test("topN caps result length at N", () => {
  const vouches = [
    { from_member_id: "m1", status: "voucher" },
    { from_member_id: "m2", status: "floor" },
    { from_member_id: "m3", status: "tapped" },
  ];
  const top = topN(vouches, 2);
  assert.equal(top.length, 2);
  assert.equal(top[0].memberId, "m1");
  assert.equal(top[1].memberId, "m2");
});

test("topN handles empty vouch list", () => {
  assert.deepEqual(topN([], 10), []);
});

test("topN ignores vouches with unknown status (scores 0)", () => {
  const vouches = [
    { from_member_id: "m1", status: "tapped" },
    { from_member_id: "m1", status: "bogus" },
  ];
  const top = topN(vouches, 10);
  assert.deepEqual(top, [{ memberId: "m1", score: 1 }]);
});
