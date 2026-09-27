import React from "react";
import { View } from "react-native";

import { makeStyles, radius } from "@/src/theme";

export function BrandMark({ size = 42 }: { size?: number }) {
  const styles = useStyles();
  const fold = Math.max(8, Math.round(size * 0.22));
  const stroke = Math.max(2, Math.round(size * 0.045));
  const lens = Math.max(8, Math.round(size * 0.24));
  return (
    <View style={[styles.box, { width: size, height: size, borderRadius: Math.round(size * radius.md / 12) }]}>
      <View style={[styles.page, { width: size * 0.56, height: size * 0.68, borderRadius: Math.max(4, size * 0.08), borderWidth: stroke }]}> 
        <View style={[styles.fold, { width: fold, height: fold }]} />
        <View style={[styles.line, { width: size * 0.25, top: size * 0.28 }]} />
        <View style={[styles.line, { width: size * 0.18, top: size * 0.39 }]} />
      </View>
      <View style={[styles.search, { width: lens, height: lens, borderRadius: lens, borderWidth: stroke }]}> 
        <View style={[styles.handle, { width: Math.max(7, size * 0.16), height: stroke, right: -size * 0.1, bottom: -size * 0.04, transform: [{ rotate: "45deg" }] }]} />
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  box: {
    backgroundColor: "#12233F",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
  },
  page: { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF", alignItems: "center", justifyContent: "flex-start", paddingTop: "12%", transform: [{ rotate: "-7deg" }] },
  fold: { position: "absolute", top: -1, right: -1, backgroundColor: "#FF6A17", borderBottomLeftRadius: 4 },
  line: { position: "absolute", left: "20%", height: 2, borderRadius: 2, backgroundColor: "#B6C4D9" },
  search: { position: "absolute", right: "14%", bottom: "15%", backgroundColor: "#FF6A17", borderColor: "#FFFFFF" },
  handle: { position: "absolute", backgroundColor: "#FFFFFF", borderRadius: 2 },
}));
