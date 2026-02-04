use std::fs;
use std::path::{Path, PathBuf};

use anyhow::Result;

use common::ensure_dir;

use crate::SkillCard;

#[derive(Debug, Clone)]
pub struct SkillStore {
    root: PathBuf,
}

impl SkillStore {
    pub fn new(root: PathBuf) -> Result<Self> {
        ensure_dir(&root)?;
        Ok(Self { root })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn path_for(&self, level_id: &str) -> PathBuf {
        self.root.join(format!("{}.json", level_id))
    }

    pub fn load(&self, level_id: &str) -> Result<Option<SkillCard>> {
        let path = self.path_for(level_id);
        if !path.exists() {
            return Ok(None);
        }
        let data = fs::read_to_string(path)?;
        let skill = serde_json::from_str(&data)?;
        Ok(Some(skill))
    }

    pub fn save(&self, level_id: &str, skill: &SkillCard) -> Result<()> {
        ensure_dir(&self.root)?;
        let path = self.path_for(level_id);
        let data = serde_json::to_string_pretty(skill)?;
        fs::write(path, data)?;
        Ok(())
    }
}
