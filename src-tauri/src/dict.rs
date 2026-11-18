//! Offline English–Chinese dictionary.
//! Data is a compact slice of ECDICT (MIT) by skywind3000: https://github.com/skywind3000/ECDICT
//! One line per lemma: `lemma \t phonetic \t translation \t form,form`.

use flate2::read::GzDecoder;
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::io::Read;

struct Entry {
    phonetic: String,
    translation: String,
    forms: Vec<String>,
}

pub struct Dict {
    entries: HashMap<String, Entry>,
    /// Inflected form → lemma, only when that form is not a headword of its own.
    form_of: HashMap<String, String>,
}

pub struct Gloss {
    pub surface: String,
    pub lemma: String,
    pub phonetic: String,
    pub translation: String,
    /// Lemma plus inflections that should light up once the lemma is saved.
    pub forms: Vec<String>,
}

static DICT: Lazy<Dict> = Lazy::new(|| {
    let mut text = String::new();
    GzDecoder::new(&include_bytes!("../resources/en-zh.txt.gz")[..]).read_to_string(&mut text).expect("dictionary");
    parse(&text)
});

pub fn normalize(raw: &str) -> String {
    raw.trim().replace('’', "'").trim_matches(|c: char| !c.is_ascii_alphabetic() && c != '\'').to_lowercase()
}

pub fn parse(text: &str) -> Dict {
    let mut entries: HashMap<String, Entry> = HashMap::new();
    for line in text.lines() {
        if line.is_empty() || line.starts_with('#') { continue; }
        let mut parts = line.split('\t');
        let Some(lemma) = parts.next() else { continue };
        if lemma.is_empty() { continue; }
        let phonetic = parts.next().unwrap_or("").to_string();
        let translation = parts.next().unwrap_or("").to_string();
        let forms = parts.next().unwrap_or("").split(',').filter(|s| !s.is_empty()).map(str::to_string).collect();
        entries.insert(lemma.to_string(), Entry { phonetic, translation, forms });
    }
    let mut form_of = HashMap::new();
    for (lemma, entry) in &entries {
        for form in &entry.forms {
            if !entries.contains_key(form) { form_of.insert(form.clone(), lemma.clone()); }
        }
    }
    Dict { entries, form_of }
}

fn gloss(surface: &str, lemma: &str, entry: &Entry) -> Gloss {
    let mut forms = Vec::with_capacity(entry.forms.len() + 1);
    forms.push(lemma.to_string());
    forms.extend(entry.forms.iter().cloned());
    Gloss { surface: surface.to_string(), lemma: lemma.to_string(), phonetic: entry.phonetic.clone(), translation: entry.translation.clone(), forms }
}

pub fn lookup(raw: &str) -> Gloss { lookup_in(&DICT, raw) }

pub fn lookup_in(dict: &Dict, raw: &str) -> Gloss {
    let surface = normalize(raw);
    if surface.is_empty() {
        return Gloss { surface, lemma: String::new(), phonetic: String::new(), translation: String::new(), forms: vec![] };
    }
    if let Some(entry) = dict.entries.get(&surface) { return gloss(&surface, &surface, entry); }
    if let Some(lemma) = dict.form_of.get(&surface) {
        if let Some(entry) = dict.entries.get(lemma) { return gloss(&surface, lemma, entry); }
    }
    Gloss { surface: surface.clone(), lemma: surface.clone(), phonetic: String::new(), translation: String::new(), forms: vec![surface] }
}

/// Surfaces to highlight for a saved lemma: the lemma itself, plus inflections that aren't their own headword.
pub fn highlight_forms(lemma: &str) -> Vec<String> {
    let lemma = normalize(lemma);
    match DICT.entries.get(&lemma) {
        Some(entry) => gloss(&lemma, &lemma, entry).forms,
        None => if lemma.is_empty() { vec![] } else { vec![lemma] },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Dict {
        parse("run\trʌn\t跑；运行\trunning,ran,runs\nsee\tsiː\t看见\tsees,saw\nsaw\t\t锯子\nword\t\t单词\twords\n")
    }

    #[test]
    fn exact_word_beats_an_inflection() {
        let g = lookup_in(&sample(), "Saw");
        assert_eq!(g.lemma, "saw");
        assert_eq!(g.translation, "锯子");
    }

    #[test]
    fn inflection_uses_the_lemma() {
        let g = lookup_in(&sample(), "running");
        assert_eq!(g.surface, "running");
        assert_eq!(g.lemma, "run");
        assert_eq!(g.translation, "跑；运行");
        assert!(g.forms.iter().any(|f| f == "ran"));
    }

    #[test]
    fn unknown_word_is_still_saveable() {
        let g = lookup_in(&sample(), "xyzzy");
        assert_eq!(g.lemma, "xyzzy");
        assert!(g.translation.is_empty());
        assert_eq!(g.forms, vec!["xyzzy".to_string()]);
    }

    #[test]
    fn bundled_dictionary_knows_common_words() {
        let hello = lookup("hello");
        assert!(hello.translation.contains('喂') || hello.translation.contains('嘿'), "{}", hello.translation);
        let runs = lookup("runs");
        assert_eq!(runs.lemma, "run");
        assert!(!runs.translation.is_empty());
    }
}
