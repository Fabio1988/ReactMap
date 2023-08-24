// @ts-check
import * as React from 'react'
import MenuItem from '@mui/material/MenuItem'
import Button from '@mui/material/Button'
import Menu from '@mui/material/Menu'
import PagesIcon from '@mui/icons-material/Pages'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogActions from '@mui/material/DialogActions'
import { useTranslation } from 'react-i18next'

import Utility from '@services/Utility'

import { fetchCode, setComponent, usePlayStore } from '../hooks/store'

const PAGES = ['loginPage', 'messageOfTheDay', 'donationPage']

const pagesIcon = <PagesIcon />

export function ComponentMenu() {
  const { t } = useTranslation()
  const component = usePlayStore((s) => s.component)
  const [anchorEl, setAnchorEl] = React.useState(null)
  const [pendingComponent, setPendingComponent] = React.useState(null)

  /**
   *
   * @param {string} [newComponent]
   */
  const handleMenuClose = (newComponent) => () => {
    const { original, code } = usePlayStore.getState()
    setAnchorEl(null)
    if (newComponent) {
      if (original === code) setComponent(newComponent)
      else setPendingComponent(newComponent)
    }
  }

  const handleDialogClose = () => setPendingComponent(null)

  const handleDialogConfirm = () => {
    handleDialogClose()
    setComponent(pendingComponent)
  }

  React.useEffect(() => {
    fetchCode(component)
  }, [component])

  return (
    <>
      <Button
        color="inherit"
        onClick={(e) => setAnchorEl(e.currentTarget)}
        startIcon={pagesIcon}
      >
        {t('component')}
      </Button>
      <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={handleMenuClose()}>
        {PAGES.map((c) => (
          <MenuItem
            key={c}
            value={c}
            dense
            onClick={handleMenuClose(c)}
            selected={c === component}
          >
            {t(`component_${Utility.camelToSnake(c)}`)}
          </MenuItem>
        ))}
      </Menu>
      <Dialog open={!!pendingComponent} onClose={handleDialogClose}>
        <DialogTitle>You have unsaved changes</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to change components?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDialogClose} color="secondary">
            Cancel
          </Button>
          <Button onClick={handleDialogConfirm}>Confirm</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
